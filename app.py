# app.py
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
import sys
import os
import time
from threading import Lock
from pathlib import Path
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
import traceback
import numpy as np
import re

app = Flask(__name__)
CORS(app)

NEXRAD_BUCKET_BASE = "https://unidata-nexrad-level3.s3.amazonaws.com"
S3_NS = {'s3': 'http://s3.amazonaws.com/doc/2006-03-01/'}
TIMESTAMP_PATTERN = re.compile(r"_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})")

REQUEST_TIMEOUT = (2.5, 20)
RADAR_KEY_CACHE_TTL = 10  # seconds before reusing cached key without hitting S3
RADAR_KEY_CACHE_MAX_AGE = 180  # hard cap before forcing a full refresh
STREAM_CHUNK_SIZE = 64 * 1024

def _build_http_session():
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=0.3,
        status_forcelist=(500, 502, 503, 504),
        allowed_methods=("GET", "HEAD")
    )
    adapter = HTTPAdapter(pool_connections=8, pool_maxsize=16, max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": "RadarApp/1.0"})
    return session

http_session = _build_http_session()
latest_key_cache = {}
latest_key_lock = Lock()

# Cache for processed WebGL data to avoid reprocessing
processed_data_cache = {}
processed_data_lock = Lock()
PROCESSED_CACHE_MAX_SIZE = 50  # Keep last 50 processed radar scans

# IEM Mesonet API base for NWS text products
IEM_BASE = "https://mesonet.agron.iastate.edu/api/1"

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import nexrad  # your existing radar parser

def _http_get(url, **kwargs):
    timeout = kwargs.pop("timeout", REQUEST_TIMEOUT)
    return http_session.get(url, timeout=timeout, **kwargs)

# --- IEM NWS Text utilities ---

def fetch_afos_list(pil: str, date: str, cccc: str | None = None):
    """Fetch AFOS metadata list for given PIL and date from IEM.
    Returns list of rows with product_id and text_link.
    """
    params = {"pil": pil, "date": date}
    if cccc:
        params["cccc"] = cccc
    url = f"{IEM_BASE}/nws/afos/list.json"
    print(f"🔍 [IEM] Fetching AFOS list: {url} with params: {params}")
    resp = _http_get(url, params=params)
    resp.raise_for_status()
    data = resp.json()
    rows = data.get("data", [])
    print(f"✅ [IEM] Found {len(rows)} AFOS products for PIL={pil}, date={date}")
    return rows

def fetch_nwstext(product_id: str, nolimit: bool = False) -> str:
    """Fetch raw NWS text product from IEM for a product_id."""
    url = f"{IEM_BASE}/nwstext/{product_id}"
    params = {"nolimit": str(nolimit).lower()} if nolimit else None
    print(f"📄 [IEM] Fetching text for product_id={product_id}")
    resp = _http_get(url, params=params)
    resp.raise_for_status()
    # Service returns plain text
    text = resp.text
    print(f"✅ [IEM] Retrieved {len(text)} chars for {product_id}")
    return text

LATLON_PATTERN = re.compile(r"LAT\.{3}LON\s+([0-9\s]+)")
EVENT_PATTERN = re.compile(r"^(Tornado Warning|Severe Thunderstorm Warning)$", re.IGNORECASE | re.MULTILINE)
HAZARD_PATTERN = re.compile(r"^\s*HAZARD\.{3}\s*(.+)$", re.MULTILINE)
SOURCE_PATTERN = re.compile(r"^\s*SOURCE\.{3}\s*(.+)$", re.MULTILINE)
TIMEMOTLOC_PATTERN = re.compile(r"^\s*TIME\.{3}MOT\.{3}LOC\s*(.+)$", re.MULTILINE)
VTEC_PATTERN = re.compile(r"/([A-Z])\.([A-Z]{3})\.([A-Z]{4})\.([A-Z]{2})\.([A-Z])\.([0-9]{4})\.([0-9]{6}T[0-9]{4}Z)-([0-9]{6}T[0-9]{4}Z)/")

def parse_warning_text(text: str):
    """Parse NWS warning text to extract event name, polygon, and key metadata.
    - Polygon from LAT...LON pairs (DDMM → DD.MM, - for west lon)
    - Event name from header line with enhanced threat detection
    - VTEC code extraction
    - Optional hazard/source/Time...Mot...Loc lines
    """
    # VTEC Code
    vtec_match = VTEC_PATTERN.search(text)
    vtec_code = None
    phenomena = None
    significance = None
    onset = None
    expires = None
    if vtec_match:
        vtec_code = vtec_match.group(0)
        phenomena = vtec_match.group(4)  # e.g., TO, SV
        significance = vtec_match.group(5)  # e.g., W, A
        onset_str = vtec_match.group(7)  # e.g., 231225T1830Z
        expires_str = vtec_match.group(8)  # e.g., 231225T1930Z
        
        # Parse onset and expiration times
        try:
            onset = datetime.strptime(onset_str, "%y%m%dT%H%MZ").replace(tzinfo=timezone.utc)
            expires = datetime.strptime(expires_str, "%y%m%dT%H%MZ").replace(tzinfo=timezone.utc)
            print(f"🔍 [Parser] VTEC: {vtec_code} (phenomena={phenomena}, sig={significance})")
            print(f"   ⏰ Valid from {onset.isoformat()} to {expires.isoformat()}")
        except Exception as e:
            print(f"⚠️ [Parser] Could not parse VTEC times: {e}")
    
    # Event Name (basic extraction - enhanced detection now happens in frontend)
    m_event = EVENT_PATTERN.search(text)
    event_name = m_event.group(1) if m_event else None
    
    print(f"🔍 [Parser] Event name: {event_name}")

    # LAT...LON polygon (may be multiple lines, take first occurrence)
    m_latlon = LATLON_PATTERN.search(text)
    coords = []
    if m_latlon:
        nums = m_latlon.group(1).strip().split()
        print(f"🔍 [Parser] Found LAT...LON with {len(nums)} numbers")
        # Parse pairs
        for i in range(0, len(nums) - 1, 2):
            try:
                lat = float(nums[i][:2] + "." + nums[i][2:])
                lon = -float(nums[i+1][:2] + "." + nums[i+1][2:])
                coords.append([lon, lat])
            except Exception:
                continue
        # Close polygon if not closed
        if coords and coords[0] != coords[-1]:
            coords.append(coords[0])
        print(f"✅ [Parser] Parsed polygon with {len(coords)} coordinates")
    else:
        print(f"⚠️ [Parser] No LAT...LON found in text")

    hazard = (HAZARD_PATTERN.search(text).group(1).strip() if HAZARD_PATTERN.search(text) else None)
    source = (SOURCE_PATTERN.search(text).group(1).strip() if SOURCE_PATTERN.search(text) else None)
    timemotloc = (TIMEMOTLOC_PATTERN.search(text).group(1).strip() if TIMEMOTLOC_PATTERN.search(text) else None)

    return {
        "eventName": event_name,
        "vtecCode": vtec_code,
        "phenomena": phenomena,
        "significance": significance,
        "onset": onset.isoformat() if onset else None,
        "expires": expires.isoformat() if expires else None,
        "polygon": coords if coords else None,
        "hazard": hazard,
        "source": source,
        "timeMotLoc": timemotloc,
    }

def build_alert_from_product(row, text):
    """Construct a frontend-friendly alert object from AFOS row + parsed text."""
    parsed = parse_warning_text(text)
    return {
        "id": row.get("product_id"),
        "pil": row.get("pil"),
        "cccc": row.get("cccc"),
        "entered": row.get("entered"),
        "event": parsed.get("eventName"),
        "vtecCode": parsed.get("vtecCode"),
        "phenomena": parsed.get("phenomena"),
        "significance": parsed.get("significance"),
        "onset": parsed.get("onset"),
        "expires": parsed.get("expires"),
        "text": text,
        "polygon": parsed.get("polygon"),
        "hazard": parsed.get("hazard"),
        "source": parsed.get("source"),
        "timeMotLoc": parsed.get("timeMotLoc"),
    }

def _list_radar_keys(prefix, max_keys=1000, start_after=None):
    params = {
        'list-type': '2',
        'prefix': prefix,
        'max-keys': max_keys,
    }
    if start_after:
        params['start-after'] = start_after

    response = _http_get(NEXRAD_BUCKET_BASE, params=params)
    response.raise_for_status()
    root = ET.fromstring(response.content)
    keys = [elem.text for elem in root.findall('s3:Contents/s3:Key', S3_NS) if elem.text]
    return keys

def _cache_latest_key(cache_key, key):
    with latest_key_lock:
        latest_key_cache[cache_key] = {
            "key": key,
            "checked_at": time.monotonic()
        }

def get_latest_radar_key(site_id, product, date=None):
    site_id = site_id.upper()
    product = product.upper()

    if date is None:
        date = datetime.now(timezone.utc).strftime("%Y_%m_%d")

    prefix = f"{site_id}_{product}_{date}"
    cache_key = (prefix,)
    now = time.monotonic()

    with latest_key_lock:
        entry = latest_key_cache.get(cache_key)
        if entry and (now - entry["checked_at"]) < RADAR_KEY_CACHE_TTL:
            return entry["key"]
        last_known_key = entry["key"] if entry else None
        last_checked = entry["checked_at"] if entry else 0

    latest_key = None

    if last_known_key:
        try:
            incremental = _list_radar_keys(prefix, max_keys=1, start_after=last_known_key)
        except Exception:
            incremental = []

        if incremental:
            latest_key = incremental[-1]
        elif (now - last_checked) < RADAR_KEY_CACHE_MAX_AGE:
            _cache_latest_key(cache_key, last_known_key)
            return last_known_key

    if latest_key is None:
        keys = _list_radar_keys(prefix)
        if not keys:
            raise FileNotFoundError(f"No radar files found for prefix {prefix}")
        latest_key = keys[-1]

    _cache_latest_key(cache_key, latest_key)
    return latest_key

def download_radar_file(site_id, product, *, use_cache=True):
    key = get_latest_radar_key(site_id, product)
    return download_radar_file_by_key(key, use_cache=use_cache)

def download_radar_file_by_key(key, *, use_cache=True):
    """Download a specific radar file by its full S3 key with aggressive caching."""
    file_url = f"{NEXRAD_BUCKET_BASE}/{key}"
    temp_dir = Path("./temp")
    temp_dir.mkdir(exist_ok=True)
    temp_path = temp_dir / key
    temp_path.parent.mkdir(parents=True, exist_ok=True)

    if use_cache and temp_path.exists() and temp_path.stat().st_size > 0:
        print(f"♻️  Reusing cached radar file {key}")
        return str(temp_path)

    print(f"✅ Fetching radar file: {file_url}")

    temp_path_tmp = temp_path.parent / f"{temp_path.name}.part"
    if temp_path_tmp.exists():
        temp_path_tmp.unlink(missing_ok=True)

    response = _http_get(file_url, stream=True)
    try:
        response.raise_for_status()
        with open(temp_path_tmp, 'wb') as f:
            for chunk in response.iter_content(STREAM_CHUNK_SIZE):
                if chunk:
                    f.write(chunk)
    except Exception:
        if temp_path_tmp.exists():
            temp_path_tmp.unlink(missing_ok=True)
        raise
    finally:
        response.close()

    temp_path_tmp.replace(temp_path)
    return str(temp_path)


def _parse_timestamp_from_key(key):
    """Extract a UTC datetime from an S3 key if possible."""
    match = TIMESTAMP_PATTERN.search(key)
    if not match:
        return None

    year, month, day, hour, minute, second = map(int, match.groups())
    return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)


def fetch_archive_scans(site_id, product, date_str):
    """List all archive scans for a site/product/date combination."""
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError as err:
        raise ValueError("Invalid date format. Use YYYY-MM-DD.") from err

    prefix = f"{site_id}_{product}_{target_date.strftime('%Y_%m_%d')}"
    scans = []
    continuation_token = None

    while True:
        params = {
            'list-type': '2',
            'prefix': prefix,
            'max-keys': 1000,
        }
        if continuation_token:
            params['continuation-token'] = continuation_token

        response = _http_get(NEXRAD_BUCKET_BASE, params=params)
        response.raise_for_status()
        root = ET.fromstring(response.content)

        contents = root.findall('s3:Contents', S3_NS)
        if not contents and not continuation_token:
            break

        for content in contents:
            key_element = content.find('s3:Key', S3_NS)
            if key_element is None or not key_element.text:
                continue

            key_text = key_element.text
            timestamp = _parse_timestamp_from_key(key_text)
            if not timestamp:
                continue

            size_elem = content.find('s3:Size', S3_NS)
            last_modified_elem = content.find('s3:LastModified', S3_NS)

            scans.append({
                "key": key_text,
                "timestamp": timestamp,
                "timeString": timestamp.strftime("%H:%M:%S UTC"),
                "sizeBytes": int(size_elem.text) if size_elem is not None and size_elem.text else None,
                "lastModified": last_modified_elem.text if last_modified_elem is not None else None,
                "fileName": key_text.split('/')[-1],
            })

        is_truncated_text = root.findtext('s3:IsTruncated', default='false', namespaces=S3_NS) or 'false'
        is_truncated = is_truncated_text.strip().lower() == 'true'
        if is_truncated:
            token_elem = root.find('s3:NextContinuationToken', S3_NS)
            continuation_token = token_elem.text if token_elem is not None else None
            if not continuation_token:
                break
        else:
            break

    scans.sort(key=lambda s: s["timestamp"])

    # Convert timestamp objects to ISO8601 strings once sorted
    for scan in scans:
        iso_ts = scan["timestamp"].isoformat().replace('+00:00', 'Z')
        scan["timestamp"] = iso_ts

    return scans


@app.route('/api/archive/timestamps/<site_id>', methods=['GET'])
def get_archive_timestamps(site_id):
    product = request.args.get('product', 'N0B')
    date_str = request.args.get('date')

    if not date_str:
        return jsonify({"error": "Missing required 'date' query parameter (YYYY-MM-DD)."}), 400

    try:
        scans = fetch_archive_scans(site_id, product, date_str)
        return jsonify({
            "siteId": site_id,
            "product": product,
            "date": date_str,
            "count": len(scans),
            "scans": scans
        })
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    except Exception:
        print(traceback.format_exc())
        return jsonify({"error": "Failed to fetch archive scans."}), 500

# --- NEW: AFOS/IEM warnings endpoint (TOR/SVR) ---
@app.route('/api/archive/warnings', methods=['GET'])
def get_archive_warnings():
    """Fetch and parse NWS warning texts (TOR/SVR) from IEM for a given date/time.
    Query params: 
      - date=YYYY-MM-DD (required)
      - time=HH:MM:SS (optional, filters to +/- 30min window)
      - pil=TOR|SVR (default TOR)
      - cccc=optional WFO
    """
    from datetime import timedelta
    
    date_str = request.args.get('date')
    time_str = request.args.get('time')
    pil = request.args.get('pil', 'TOR')  # 'TOR' or 'SVR'
    cccc = request.args.get('cccc')
    
    if not date_str:
        return jsonify({"error": "Missing required 'date' query parameter (YYYY-MM-DD)."}), 400
    
    print(f"\n{'='*60}")
    print(f"🌩️ [WARNINGS] Fetching historical warnings for {date_str} {time_str or '(all day)'}")
    print(f"   PIL: {pil}, WFO: {cccc or 'ALL'}")
    print(f"{'='*60}")
    
    try:
        # Fetch full AFOS list for the day
        rows = fetch_afos_list(pil, date_str, cccc)
        print(f"📋 Retrieved {len(rows)} AFOS products")
        
        # Note: Initial time filtering removed - we'll filter by active status after parsing VTEC times
        radar_time = None
        if time_str:
            radar_time = datetime.fromisoformat(f"{date_str}T{time_str}Z").replace(tzinfo=timezone.utc)
            print(f"⏰ Radar scan time: {radar_time.isoformat()}")
            print(f"   Will filter to warnings ACTIVE at this exact time")
        
        alerts = []
        skipped = 0
        errors = 0
        
        for idx, row in enumerate(rows, 1):
            pid = row.get('product_id')
            if not pid:
                skipped += 1
                continue
            
            print(f"\n[{idx}/{len(rows)}] Processing product: {pid}")
            try:
                txt = fetch_nwstext(pid)
                alert = build_alert_from_product(row, txt)
                # Only include if it has VTEC phenomena TO or SV (covers all variants) and has polygon
                phenomena = alert.get('phenomena')
                if phenomena in ('TO', 'SV'):
                    if alert.get('polygon'):
                        # Filter by active status if radar_time is specified
                        if radar_time:
                            onset_str = alert.get('onset')
                            expires_str = alert.get('expires')
                            if onset_str and expires_str:
                                try:
                                    onset = datetime.fromisoformat(onset_str)
                                    expires = datetime.fromisoformat(expires_str)
                                    if onset <= radar_time <= expires:
                                        alerts.append(alert)
                                        print(f"✅ Added {alert.get('event')} - ACTIVE at radar time")
                                        print(f"   Valid: {onset.strftime('%H:%M')} - {expires.strftime('%H:%M')} UTC")
                                    else:
                                        print(f"⚠️ Skipped {alert.get('event')} - NOT active at radar time")
                                        print(f"   Valid: {onset.strftime('%H:%M')} - {expires.strftime('%H:%M')} UTC (radar: {radar_time.strftime('%H:%M')})")
                                        skipped += 1
                                except Exception as e:
                                    print(f"⚠️ Skipped - error parsing times: {e}")
                                    skipped += 1
                            else:
                                print(f"⚠️ Skipped {alert.get('event')} - missing onset/expires times")
                                skipped += 1
                        else:
                            # No radar_time specified, include all warnings with polygons
                            alerts.append(alert)
                            print(f"✅ Added {alert.get('event')} with polygon ({len(alert.get('polygon', []))} points)")
                    else:
                        print(f"⚠️ Skipped {alert.get('event')} - no polygon found")
                        skipped += 1
                else:
                    print(f"⚠️ Skipped - phenomena: {phenomena}, event: {alert.get('event')}")
                    skipped += 1
            except Exception as e:
                errors += 1
                print(f"❌ Error processing {pid}: {str(e)}")
                continue
        
        print(f"\n{'='*60}")
        print(f"📊 [WARNINGS] Summary:")
        print(f"   ✅ Valid warnings: {len(alerts)}")
        print(f"   ⚠️ Skipped: {skipped}")
        print(f"   ❌ Errors: {errors}")
        print(f"{'='*60}\n")
        
        return jsonify({
            "date": date_str,
            "pil": pil,
            "count": len(alerts),
            "alerts": alerts,
        })
    except Exception:
        print(traceback.format_exc())
        return jsonify({"error": "Failed to fetch warnings from IEM."}), 500


@app.route('/api/archive/file', methods=['GET'])
def get_archive_file():
    key = request.args.get('key')
    if not key:
        return jsonify({"error": "Missing required 'key' query parameter."}), 400

    try:
        file_path = download_radar_file_by_key(key)
        filename = Path(file_path).name
        return send_file(file_path, as_attachment=True, download_name=filename)
    except FileNotFoundError:
        return jsonify({"error": "Radar file not found."}), 404
    except Exception as err:
        print(traceback.format_exc())
        return jsonify({"error": str(err)}), 500


def extract_radar_data(radar_data):
    azimuths = None
    ranges = None
    radar_values = None

    if hasattr(radar_data, 'sym_block') and radar_data.sym_block:
        for layer in radar_data.sym_block:
            if not isinstance(layer, (list, tuple)):
                continue
            for packet in layer:
                if isinstance(packet, dict) and 'start_az' in packet and 'data' in packet:
                    azimuths = packet['start_az']

                    if hasattr(radar_data, 'ij_to_km'):
                        gate_km = radar_data.ij_to_km
                    else:
                        gate_km = packet.get('gate_scale', 1000) / 1000.0

                    first_bin = packet.get('first', 0)
                    first_km = first_bin * gate_km

                    num_bins = len(packet['data'][0]) if packet['data'] else 0
                    ranges = np.linspace(first_km, first_km + (num_bins - 1) * gate_km, num_bins).tolist()

                    try:
                        radar_values = [
                            radar_data.map_data(np.frombuffer(radial_bytes, dtype=np.uint8))
                            for radial_bytes in packet['data']
                        ]
                        break
                    except Exception as e:
                        print(f"❌ Error mapping radar values: {e}")
                        continue
            if azimuths is not None:
                break
    return azimuths, ranges, radar_values

def get_site_coordinates(site_id):
    # Remove leading K if present
    if site_id.startswith('K') and len(site_id) > 1:
        site_id = site_id[1:]
    
    sites = {
        "ABR": {"lat": 45.45583, "lon": -98.41306},
        "ENX": {"lat": 42.58639, "lon": -74.06389},
        "ABX": {"lat": 35.14972, "lon": -106.82389},
        "FDR": {"lat": 34.36222, "lon": -98.97639},
        "AMA": {"lat": 35.23333, "lon": -101.70917},
        "AHG": {"lat": 60.72583, "lon": -151.35139},
        "GUA": {"lat": 13.45250, "lon": 144.80583},
        "FFC": {"lat": 33.36361, "lon": -84.56583},
        "EWX": {"lat": 29.70389, "lon": -98.02833},
        "BBX": {"lat": 39.49611, "lon": -121.63167},
        "ABC": {"lat": 60.79194, "lon": -161.87639},
        "BLX": {"lat": 45.85389, "lon": -108.60611},
        "BGM": {"lat": 42.19972, "lon": -75.98472},
        "BMX": {"lat": 33.17222, "lon": -86.76972},
        "BIS": {"lat": 46.77083, "lon": -100.76056},
        "CBX": {"lat": 43.49056, "lon": -116.23556},
        "BOX": {"lat": 41.95583, "lon": -71.13694},
        "BRO": {"lat": 25.91611, "lon": -97.41889},
        "BUF": {"lat": 42.94889, "lon": -78.73667},
        "CXX": {"lat": 44.51111, "lon": -73.16694},
        "RSG": {"lat": 36.95583, "lon": 127.02111},
        "FDX": {"lat": 34.63528, "lon": -103.62972},
        "ICX": {"lat": 37.59083, "lon": -112.86222},
        "CLX": {"lat": 32.65556, "lon": -81.04222},
        "RLX": {"lat": 38.31111, "lon": -81.72306},
        "CYS": {"lat": 41.15194, "lon": -104.80611},
        "LOT": {"lat": 41.60472, "lon": -88.08472},
        "ILN": {"lat": 39.42028, "lon": -83.82167},
        "CLE": {"lat": 41.41306, "lon": -81.85972},
        "CAE": {"lat": 33.94861, "lon": -81.11833},
        "GWX": {"lat": 33.89667, "lon": -88.32889},
        "CRP": {"lat": 27.78417, "lon": -97.51111},
        "FWS": {"lat": 32.57306, "lon": -97.30306},
        "DVN": {"lat": 41.61167, "lon": -90.58083},
        "FTG": {"lat": 39.78667, "lon": -104.54583},
        "DMX": {"lat": 41.73111, "lon": -93.72278},
        "DTX": {"lat": 42.69972, "lon": -83.47167},
        "DDC": {"lat": 37.76083, "lon": -99.96889},
        "DOX": {"lat": 38.82556, "lon": -75.44000},
        "DLH": {"lat": 46.83694, "lon": -92.20972},
        "DYX": {"lat": 32.53833, "lon": -99.25444},
        "EYX": {"lat": 35.09778, "lon": -117.56083},
        "EVX": {"lat": 30.56444, "lon": -85.92139},
        "EPZ": {"lat": 31.87306, "lon": -106.69806},
        "LRX": {"lat": 40.73972, "lon": -116.80278},
        "BHX": {"lat": 40.49833, "lon": -124.29194},
        "APD": {"lat": 65.03500, "lon": -147.50167},
        "FSX": {"lat": 34.57444, "lon": -111.19778},
        "HPX": {"lat": 36.73667, "lon": -87.28500},
        "GRK": {"lat": 30.72194, "lon": -97.38306},
        "POE": {"lat": 31.15556, "lon": -92.97583},
        "EOX": {"lat": 31.46056, "lon": -85.45944},
        "SRX": {"lat": 35.29056, "lon": -94.36167},
        "IWX": {"lat": 41.35889, "lon": -85.70000},
        "APX": {"lat": 44.90722, "lon": -84.71972},
        "GGW": {"lat": 48.20639, "lon": -106.62500},
        "GLD": {"lat": 39.36694, "lon": -101.70028},
        "MVX": {"lat": 47.52778, "lon": -97.32556},
        "GJX": {"lat": 39.06222, "lon": -108.21389},
        "GRR": {"lat": 42.89389, "lon": -85.54472},
        "TFX": {"lat": 47.45972, "lon": -111.38528},
        "GRB": {"lat": 44.49833, "lon": -88.11139},
        "GSP": {"lat": 34.88333, "lon": -82.22000},
        "RMX": {"lat": 43.46778, "lon": -75.45778},
        "UEX": {"lat": 40.32083, "lon": -98.44194},
        "HDX": {"lat": 33.07639, "lon": -106.12278},
        "CBW": {"lat": 46.03917, "lon": -67.80639},
        "HGX": {"lat": 29.47194, "lon": -95.07917},
        "HTX": {"lat": 34.93056, "lon": -86.08333},
        "IND": {"lat": 39.70750, "lon": -86.28028},
        "JKL": {"lat": 37.59083, "lon": -83.31306},
        "DGX": {"lat": 32.31778, "lon": -90.08000},
        "JAX": {"lat": 30.48472, "lon": -81.70194},
        "ODN": {"lat": 26.30194, "lon": 127.90972},
        "HKN": {"lat": 20.12556, "lon": -155.77778},
        "EAX": {"lat": 38.81028, "lon": -94.26444},
        "BYX": {"lat": 24.59750, "lon": -81.70306},
        "AKC": {"lat": 58.67944, "lon": -156.62944},
        "MRX": {"lat": 36.16861, "lon": -83.40167},
        "KJK": {"lat": 35.92417, "lon": 126.62222},
        "ARX": {"lat": 43.82278, "lon": -91.19111},
        "PLA": {"lat": 38.73028, "lon": -27.32167},
        "LCH": {"lat": 30.12528, "lon": -93.21583},
        "ESX": {"lat": 35.70111, "lon": -114.89139},
        "DFX": {"lat": 29.27278, "lon": -100.28056},
        "ILX": {"lat": 40.15056, "lon": -89.33722},
        "LZK": {"lat": 34.83639, "lon": -92.26222},
        "VTX": {"lat": 34.41167, "lon": -119.17944},
        "LVX": {"lat": 37.97528, "lon": -85.94389},
        "LBB": {"lat": 33.65417, "lon": -101.81417},
        "MQT": {"lat": 46.53111, "lon": -87.54833},
        "MXX": {"lat": 32.53667, "lon": -85.78972},
        "MAX": {"lat": 42.08111, "lon": -122.71722},
        "MLB": {"lat": 28.11333, "lon": -80.65417},
        "NQA": {"lat": 35.34472, "lon": -89.87333},
        "AMX": {"lat": 25.61111, "lon": -80.41278},
        "AIH": {"lat": 59.46139, "lon": -146.30306},
        "MAF": {"lat": 31.94333, "lon": -102.18917},
        "MKX": {"lat": 42.96778, "lon": -88.55056},
        "MPX": {"lat": 44.84889, "lon": -93.56556},
        "MBX": {"lat": 48.39250, "lon": -100.86500},
        "MSX": {"lat": 47.04111, "lon": -113.98611},
        "MOB": {"lat": 30.67944, "lon": -88.23972},
        "HMO": {"lat": 21.13278, "lon": -157.18000},
        "VAX": {"lat": 30.39028, "lon": -83.00167},
        "MHX": {"lat": 34.77611, "lon": -76.87611},
        "OHX": {"lat": 36.24722, "lon": -86.56250},
        "LIX": {"lat": 30.33667, "lon": -89.82556},
        "OKX": {"lat": 40.86556, "lon": -72.86389},
        "AEC": {"lat": 64.51139, "lon": -165.29500},
        "AKQ": {"lat": 36.98389, "lon": -77.00722},
        "LNX": {"lat": 41.95778, "lon": -100.57639},
        "TLX": {"lat": 35.33306, "lon": -97.27750},
        "OAX": {"lat": 41.32028, "lon": -96.36667},
        "PAH": {"lat": 37.06833, "lon": -88.77194},
        "PDT": {"lat": 45.69056, "lon": -118.85278},
        "DIX": {"lat": 39.94694, "lon": -74.41083},
        "IWA": {"lat": 33.28917, "lon": -111.66972},
        "PBZ": {"lat": 40.53167, "lon": -80.21806},
        "SFX": {"lat": 43.10583, "lon": -112.68611},
        "GYX": {"lat": 43.89139, "lon": -70.25639},
        "RTX": {"lat": 45.71472, "lon": -122.96528},
        "PUX": {"lat": 38.45944, "lon": -104.18139},
        "RAX": {"lat": 35.66556, "lon": -78.49000},
        "UDX": {"lat": 44.12500, "lon": -102.82972},
        "RGX": {"lat": 39.75417, "lon": -119.46167},
        "RIW": {"lat": 43.06611, "lon": -108.47722},
        "FCX": {"lat": 37.02444, "lon": -80.27389},
        "JGX": {"lat": 32.67528, "lon": -83.35111},
        "DAX": {"lat": 38.50111, "lon": -121.67750},
        "LSX": {"lat": 38.69889, "lon": -90.68278},
        "MTX": {"lat": 41.26278, "lon": -112.44750},
        "SJT": {"lat": 31.37139, "lon": -100.49250},
        "NKX": {"lat": 32.91889, "lon": -117.04194},
        "MUX": {"lat": 37.15528, "lon": -121.89833},
        "HNX": {"lat": 36.31417, "lon": -119.63194},
        "JUA": {"lat": 18.11556, "lon": -66.07806},
        "SOX": {"lat": 33.81778, "lon": -117.63583},
        "ATX": {"lat": 48.19444, "lon": -122.49583},
        "SHV": {"lat": 32.45083, "lon": -93.84139},
        "FSD": {"lat": 43.58778, "lon": -96.72944},
        "ACG": {"lat": 56.85278, "lon": -135.52917},
        "HKI": {"lat": 21.89417, "lon": -159.55222},
        "HWA": {"lat": 19.09500, "lon": -155.56889},
        "OTX": {"lat": 47.68028, "lon": -117.62667},
        "SGF": {"lat": 37.23528, "lon": -93.40056},
        "CCX": {"lat": 40.92306, "lon": -78.00361},
        "LWX": {"lat": 38.97528, "lon": -77.47778},
        "TLH": {"lat": 30.39750, "lon": -84.32889},
        "TBW": {"lat": 27.70556, "lon": -82.40167},
        "TWX": {"lat": 38.99694, "lon": -96.22583},
        "EMX": {"lat": 31.89361, "lon": -110.63028},
        "INX": {"lat": 36.17500, "lon": -95.56472},
        "VNX": {"lat": 36.74083, "lon": -98.12778},
        "VBX": {"lat": 34.83806, "lon": -120.39750},
        "ICT": {"lat": 37.65472, "lon": -97.44278},
        "LTX": {"lat": 33.98944, "lon": -78.42889},
        "YUX": {"lat": 32.49528, "lon": -114.65667}
    }
    
    return sites.get(site_id, {"lat": 39.8333333, "lon": -98.585522})

def fast_polar_to_latlon_vec(azimuths, ranges, origin):
    """
    Fast vectorized polar to lat/lon approx using flat earth math.
    Inputs are 1D numpy arrays.
    Returns Nx2 array of [lon, lat].
    """
    lat0, lon0 = origin['lat'], origin['lon']

    # Pre-compute sin/cos once
    az_rad = np.radians(azimuths)
    sin_az = np.sin(az_rad)
    cos_az = np.cos(az_rad)
    
    x = ranges * sin_az    # km east
    y = ranges * cos_az    # km north

    # Degree per km approx at ~40°N latitude
    lat = lat0 + y * 0.008983
    lon = lon0 + x * 0.011427

    # Use column_stack instead of vstack + transpose (faster)
    return np.column_stack([lon, lat])

def calculate_vertices_batch(az_start_arr, az_end_arr, r1_arr, r2_arr, origin):
    """
    Vectorized polygon vertices calc with flat-earth approx for speed.
    Returns array shape (N, 4, 2) of lon/lat corners.
    """
    N = len(az_start_arr)
    lat0, lon0 = origin['lat'], origin['lon']
    
    # Pre-compute trig for all azimuths
    az_start_rad = np.radians(az_start_arr)
    az_end_rad = np.radians(az_end_arr)
    sin_start = np.sin(az_start_rad)
    cos_start = np.cos(az_start_rad)
    sin_end = np.sin(az_end_rad)
    cos_end = np.cos(az_end_rad)
    
    # Calculate all 4 corners using broadcasting
    # Corner 1: (az_start, r1)
    x1 = r1_arr * sin_start
    y1 = r1_arr * cos_start
    lat1 = lat0 + y1 * 0.008983
    lon1 = lon0 + x1 * 0.011427
    
    # Corner 2: (az_start, r2)
    x2 = r2_arr * sin_start
    y2 = r2_arr * cos_start
    lat2 = lat0 + y2 * 0.008983
    lon2 = lon0 + x2 * 0.011427
    
    # Corner 3: (az_end, r2)
    x3 = r2_arr * sin_end
    y3 = r2_arr * cos_end
    lat3 = lat0 + y3 * 0.008983
    lon3 = lon0 + x3 * 0.011427
    
    # Corner 4: (az_end, r1)
    x4 = r1_arr * sin_end
    y4 = r1_arr * cos_end
    lat4 = lat0 + y4 * 0.008983
    lon4 = lon0 + x4 * 0.011427
    
    # Stack directly into (N, 4, 2) without intermediate flatten/reshape
    coords = np.empty((N, 4, 2), dtype=np.float32)
    coords[:, 0, 0] = lon1
    coords[:, 0, 1] = lat1
    coords[:, 1, 0] = lon2
    coords[:, 1, 1] = lat2
    coords[:, 2, 0] = lon3
    coords[:, 2, 1] = lat3
    coords[:, 3, 0] = lon4
    coords[:, 3, 1] = lat4
    
    return coords

@app.route('/api/radar/<site_id>', methods=['GET'])
def get_radar_data(site_id):
    product = request.args.get('product', 'N0B')
    try:
        radar_file_path = download_radar_file(site_id, product)
        if product.startswith('N0'):
            radar_data = nexrad.Level3File(radar_file_path)
        else:
            radar_data = nexrad.Level2File(radar_file_path)

        geojson = convert_radar_to_geojson(radar_data, site_id)
        return jsonify(geojson)
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

def convert_radar_to_geojson(radar_data, site_id):
    site_coords = get_site_coordinates(site_id)
    azimuths, ranges, radar_values = extract_radar_data(radar_data)
    if azimuths is None or ranges is None or radar_values is None:
        return {"type": "FeatureCollection", "features": []}

    azimuths = np.array(azimuths)
    ranges = np.array(ranges)
    radar_values = np.array(radar_values)

    # Wrap azimuths for polygon edges
    az_start = azimuths
    az_end = np.roll(azimuths, -1)
    az_diff = (az_end - az_start) % 360
    valid_az = az_diff < 10
    if not np.any(valid_az):
        return {"type": "FeatureCollection", "features": []}

    r1 = ranges[:-1]
    r2 = ranges[1:]
    valid_az_indices = np.where(valid_az)[0]

    features = []
    dbz_threshold = 0 # increase threshold to skip weak/noise signals

    for idx in valid_az_indices:
        az_s = az_start[idx]
        az_e = az_end[idx]
        vals = radar_values[idx, :-1]

        # Filter vals above threshold, drop tiny/noise pixels — huge perf gain
        valid_mask = (vals > dbz_threshold) & ~np.isnan(vals)
        if not np.any(valid_mask):
            continue

        valid_rng_indices = np.where(valid_mask)[0]

        az_start_arr = np.full(len(valid_rng_indices), az_s)
        az_end_arr = np.full(len(valid_rng_indices), az_e)
        r1_arr = r1[valid_rng_indices]
        r2_arr = r2[valid_rng_indices]

        verts = calculate_vertices_batch(az_start_arr, az_end_arr, r1_arr, r2_arr, site_coords)

        for i, rng_idx in enumerate(valid_rng_indices):
            poly_coords = verts[i].tolist()
            poly_coords.append(poly_coords[0])  # close polygon

            features.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [poly_coords]},
                "properties": {"dbz": float(vals[rng_idx])}
            })

    print(f"⚡ Built {len(features)} polygons after filtering weak signals")
    return {"type": "FeatureCollection", "features": features}


# --- NEW: Function to process data for WebGL ---
def convert_radar_to_webgl_data(radar_data, site_id, product='N0B'):
    """
    Processes radar data into flat arrays of vertices and dBZ/velocity values
    for efficient WebGL rendering.
    """
    t_start = time.time()
    site_coords = get_site_coordinates(site_id)
    
    t_extract = time.time()
    azimuths, ranges, radar_values = extract_radar_data(radar_data)
    if azimuths is None or ranges is None or radar_values is None:
        return np.array([], dtype=np.float32), np.array([], dtype=np.float32)
    print(f"  ⏱️  extract_radar_data: {(time.time() - t_extract)*1000:.1f}ms")

    azimuths = np.array(azimuths)
    ranges = np.array(ranges)
    radar_values = np.array(radar_values)

    az_start = azimuths
    az_end = np.roll(azimuths, -1)
    az_diff = (az_end - az_start) % 360
    valid_az = az_diff < 10
    if not np.any(valid_az):
        return [], []

    r1 = ranges[:-1]
    r2 = ranges[1:]
    valid_az_indices = np.where(valid_az)[0]

    # OPTIMIZED: Pre-allocate arrays and use vectorized operations
    is_velocity_product = product in ['N0G', 'N0S', 'N1G', 'N1S', 'N2G', 'N2S', 'N3G', 'N3S']
    value_threshold = -999 if is_velocity_product else 0
    
    # Collect all valid data first
    all_az_starts = []
    all_az_ends = []
    all_r1s = []
    all_r2s = []
    all_vals = []
    
    for idx in valid_az_indices:
        az_s = az_start[idx]
        az_e = az_end[idx]
        vals = radar_values[idx, :-1]
        
        if is_velocity_product:
            valid_mask = ~np.isnan(vals) & (vals != -999)
        else:
            valid_mask = (vals > value_threshold) & ~np.isnan(vals)
            
        if not np.any(valid_mask):
            continue
        
        valid_rng_indices = np.where(valid_mask)[0]
        n_valid = len(valid_rng_indices)
        
        all_az_starts.extend([az_s] * n_valid)
        all_az_ends.extend([az_e] * n_valid)
        all_r1s.extend(r1[valid_rng_indices])
        all_r2s.extend(r2[valid_rng_indices])
        all_vals.extend(vals[valid_rng_indices])
    
    if not all_az_starts:
        return np.array([], dtype=np.float32), np.array([], dtype=np.float32)
    
    # Convert to numpy arrays for batch processing
    all_az_starts = np.array(all_az_starts)
    all_az_ends = np.array(all_az_ends)
    all_r1s = np.array(all_r1s)
    all_r2s = np.array(all_r2s)
    all_vals = np.array(all_vals, dtype=np.float32)
    
    # Calculate all vertices at once
    t_vertices = time.time()
    verts_batch = calculate_vertices_batch(all_az_starts, all_az_ends, all_r1s, all_r2s, site_coords)
    print(f"  ⏱️  calculate_vertices_batch: {(time.time() - t_vertices)*1000:.1f}ms")
    
    # VECTORIZED: Build triangles using NumPy array operations (100x faster than Python loops!)
    t_triangles = time.time()
    n_quads = len(verts_batch)
    
    # Convert verts_batch list to numpy array for vectorized operations
    # verts_batch is shape (n_quads, 4, 2) - 4 vertices, each with (lon, lat)
    verts_array = np.array(verts_batch, dtype=np.float32)  # Shape: (n_quads, 4, 2)
    
    # Pre-allocate output arrays
    vertices_flat = np.empty(n_quads * 12, dtype=np.float32)  # 6 vertices * 2 coords
    values_flat = np.repeat(all_vals, 6)  # Each value repeated 6 times
    
    # Vectorized triangle construction - reshape and interleave
    # Triangle 1: v0, v1, v2
    vertices_flat[0::12] = verts_array[:, 0, 0]  # v0 lon
    vertices_flat[1::12] = verts_array[:, 0, 1]  # v0 lat
    vertices_flat[2::12] = verts_array[:, 1, 0]  # v1 lon
    vertices_flat[3::12] = verts_array[:, 1, 1]  # v1 lat
    vertices_flat[4::12] = verts_array[:, 2, 0]  # v2 lon
    vertices_flat[5::12] = verts_array[:, 2, 1]  # v2 lat
    
    # Triangle 2: v0, v2, v3
    vertices_flat[6::12] = verts_array[:, 0, 0]  # v0 lon
    vertices_flat[7::12] = verts_array[:, 0, 1]  # v0 lat
    vertices_flat[8::12] = verts_array[:, 2, 0]  # v2 lon
    vertices_flat[9::12] = verts_array[:, 2, 1]  # v2 lat
    vertices_flat[10::12] = verts_array[:, 3, 0] # v3 lon
    vertices_flat[11::12] = verts_array[:, 3, 1] # v3 lat
    
    print(f"  ⏱️  build_triangles (vectorized): {(time.time() - t_triangles)*1000:.1f}ms")
    
    elapsed = (time.time() - t_start) * 1000
    print(f"⚡ Built {n_quads * 2} triangles for WebGL ({product}) in {elapsed:.1f}ms")
    
    # Return NumPy arrays directly to avoid costly list conversion
    return vertices_flat, values_flat

@app.route('/api/radar-latest-key/<site_id>', methods=['GET'])
def get_latest_radar_key_api(site_id):
    product = request.args.get('product', 'N0B')
    try:
        key = get_latest_radar_key(site_id, product)
        return jsonify({"key": key})
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

# --- NEW: API Endpoint for WebGL data ---
@app.route('/api/radar-webgl/<site_id>', methods=['GET'])
def get_radar_data_webgl(site_id):
    product = request.args.get('product', 'N0B')
    format_type = request.args.get('format', 'json')  # 'json' or 'binary'
    specific_key = request.args.get('key', None)  # Optional: specific radar file key
    
    t_start = time.time()
    try:
        # If a specific key is provided, use it; otherwise get the latest
        t_key = time.time()
        if specific_key:
            cache_key = specific_key
            radar_file_path = download_radar_file_by_key(specific_key)
        else:
            key = get_latest_radar_key(site_id, product)
            cache_key = key
            radar_file_path = download_radar_file_by_key(key)
        print(f"⏱️  Key lookup + download: {(time.time() - t_key)*1000:.1f}ms")
        
        # Check if we already have processed data for this radar scan
        with processed_data_lock:
            if cache_key in processed_data_cache:
                print(f"🚀 Using cached processed data for {cache_key}")
                vertices, values = processed_data_cache[cache_key]
                print(f"⏱️  TOTAL (cached): {(time.time() - t_start)*1000:.1f}ms")
                
                if format_type == 'binary':
                    return create_binary_response(vertices, values)
                else:
                    return jsonify({"vertices": vertices, "values": values})
        
        # Process the radar data
        t_parse = time.time()
        if product.startswith('N0'):
            radar_data = nexrad.Level3File(radar_file_path)
        else:
            radar_data = nexrad.Level2File(radar_file_path)
        print(f"⏱️  Radar file parse: {(time.time() - t_parse)*1000:.1f}ms")

        t_convert = time.time()
        vertices, values = convert_radar_to_webgl_data(radar_data, site_id, product)
        print(f"⏱️  Convert to WebGL: {(time.time() - t_convert)*1000:.1f}ms")
        
        # Cache the processed data
        with processed_data_lock:
            processed_data_cache[cache_key] = (vertices, values)
            # Limit cache size
            if len(processed_data_cache) > PROCESSED_CACHE_MAX_SIZE:
                oldest_key = next(iter(processed_data_cache))
                del processed_data_cache[oldest_key]
        
        print(f"⏱️  TOTAL (uncached): {(time.time() - t_start)*1000:.1f}ms")
        
        # OPTIMIZATION: Binary format is 5-10x faster than JSON!
        if format_type == 'binary':
            return create_binary_response(vertices, values)
        else:
            # Fallback to JSON (slower but compatible)
            return jsonify({
                "vertices": vertices,
                "values": values
            })
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

def create_binary_response(vertices, values):
    """
    Create a binary response with radar data.
    Format: [vertexCount (uint32)] [vertices (float32[])] [values (float32[])]
    This is 5-10x faster than JSON for large datasets!
    """
    import struct
    import gzip
    
    # Convert to numpy arrays if they aren't already
    vertices_array = np.array(vertices, dtype=np.float32)
    values_array = np.array(values, dtype=np.float32)
    
    vertex_count = len(values_array)
    
    # Build binary data
    # 1. Write vertex count (4 bytes, uint32)
    binary_data = bytearray(struct.pack('<I', vertex_count))
    
    # 2. Write vertices array (float32 array)
    binary_data.extend(vertices_array.tobytes())
    
    # 3. Write values array (float32 array)
    binary_data.extend(values_array.tobytes())
    
    # Convert bytearray to bytes for Flask/Werkzeug
    binary_bytes = bytes(binary_data)
    
    # OPTIMIZATION: Compress with gzip (70-80% size reduction!)
    compressed_bytes = gzip.compress(binary_bytes, compresslevel=6)
    
    print(f"✅ Binary response: {len(binary_bytes)} bytes → {len(compressed_bytes)} bytes compressed ({vertex_count} vertices)")
    print(f"   Compression ratio: {100 * (1 - len(compressed_bytes)/len(binary_bytes)):.1f}% smaller")
    
    return Response(
        compressed_bytes,
        mimetype='application/octet-stream',
        headers={
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'gzip',
            'Content-Length': str(len(compressed_bytes))
        }
    )


if __name__ == '__main__':
    app.run(debug=True, port=5100)