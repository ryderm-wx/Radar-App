# radar-api/app.py
# Radar data API for the Radar-App frontend (port 5100).
#
# Serves NEXRAD Level 3 (unidata-nexrad-level3) and Level 2
# (noaa-nexrad-level2 archive + unidata-nexrad-level2-chunks live) data,
# processed into WebGL-ready binary payloads:
#   - "triangles": [uint32 vertexCount][float32 lon,lat x2 per vertex][float32 value per vertex]
#   - "radial":    RADR-magic grid payload; the client builds + caches the mesh
# Endpoints match app.js expectations (radar-webgl, radar-webgl-batch,
# radar-latest-key, radar-level2-files, level2-stream SSE, archive/*).
#
# Runs cross-platform (replaces the Windows-only radar-api.exe).

import base64
import gzip
import io
import json
import os
import re
import struct
import sys
import threading
import time
import traceback
import xml.etree.ElementTree as ET
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import requests
from flask import Flask, Response, jsonify, request, send_file
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import nexrad  # recovered MetPy-derived Level2File / Level3File parsers
import tda  # NSSL TDA-lite tornado detection (gate-to-gate delta-V)

app = Flask(__name__)

# ---------------------------------------------------------------------------
# CORS (manual, avoids flask-cors dependency)
# ---------------------------------------------------------------------------

@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.route("/api/<path:_any>", methods=["OPTIONS"])
def cors_preflight(_any):
    return ("", 204)

# ---------------------------------------------------------------------------
# Constants / shared state
# ---------------------------------------------------------------------------

L3_BUCKET = "https://unidata-nexrad-level3.s3.amazonaws.com"
# Unidata mirror of the NEXRAD Level 2 archive: the noaa-nexrad-level2 bucket
# stopped allowing anonymous access, this mirror keeps the same key layout
L2_BUCKET = "https://unidata-nexrad-level2.s3.amazonaws.com"
L2_CHUNK_BUCKET = "https://unidata-nexrad-level2-chunks.s3.amazonaws.com"
S3_NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
IEM_BASE = "https://mesonet.agron.iastate.edu/api/1"

TIMESTAMP_PATTERN = re.compile(r"_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})")
L2_KEY_TIME_PATTERN = re.compile(r"(\d{8})_(\d{6})")

REQUEST_TIMEOUT = (3, 30)
RADIAL_MAGIC = 0x52414452  # 'RADR' little-endian, matches app.js

HERE = Path(__file__).resolve().parent
TEMP_DIR = HERE / "temp"
PROCESSED_DIR = TEMP_DIR / "processed"
TEMP_DIR.mkdir(exist_ok=True)
PROCESSED_DIR.mkdir(exist_ok=True)

VELOCITY_CODES = {"G", "S", "U", "V"}


def _build_http_session():
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=0.3,
        status_forcelist=(500, 502, 503, 504),
        allowed_methods=("GET", "HEAD"),
    )
    adapter = HTTPAdapter(pool_connections=16, pool_maxsize=32, max_retries=retries)
    session.mount("https://", adapter)
    session.headers.update({"User-Agent": "RadarApp/2.0"})
    return session


http = _build_http_session()


def _http_get(url, **kwargs):
    timeout = kwargs.pop("timeout", REQUEST_TIMEOUT)
    return http.get(url, timeout=timeout, **kwargs)


class LRUCache:
    """Tiny thread-safe LRU for processed payloads."""

    def __init__(self, max_items=120):
        self._data = OrderedDict()
        self._lock = threading.Lock()
        self._max = max_items

    def get(self, key):
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
                return self._data[key]
        return None

    def put(self, key, value):
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self._max:
                self._data.popitem(last=False)


payload_cache = LRUCache(max_items=150)
listing_cache = LRUCache(max_items=200)

# ---------------------------------------------------------------------------
# S3 listing helpers
# ---------------------------------------------------------------------------

def _list_bucket(bucket, prefix, max_keys=1000, start_after=None, continuation=None,
                 want_meta=False):
    params = {"list-type": "2", "prefix": prefix, "max-keys": max_keys}
    if start_after:
        params["start-after"] = start_after
    if continuation:
        params["continuation-token"] = continuation
    resp = _http_get(bucket, params=params)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)
    out = []
    for content in root.findall("s3:Contents", S3_NS):
        key = content.findtext("s3:Key", namespaces=S3_NS)
        if not key:
            continue
        if want_meta:
            out.append({
                "key": key,
                "lastModified": content.findtext("s3:LastModified", namespaces=S3_NS),
                "size": int(content.findtext("s3:Size", default="0", namespaces=S3_NS) or 0),
            })
        else:
            out.append(key)
    token = None
    if (root.findtext("s3:IsTruncated", default="false", namespaces=S3_NS) or "").lower() == "true":
        token = root.findtext("s3:NextContinuationToken", namespaces=S3_NS)
    return out, token


def _list_all(bucket, prefix, want_meta=False, max_pages=20):
    items, token, pages = [], None, 0
    while pages < max_pages:
        batch, token = _list_bucket(bucket, prefix, continuation=token, want_meta=want_meta)
        items.extend(batch)
        pages += 1
        if not token:
            break
    return items

# ---------------------------------------------------------------------------
# Level 3: latest-key lookup with incremental cache
# ---------------------------------------------------------------------------

latest_key_cache = {}
latest_key_lock = threading.Lock()
L3_KEY_TTL = 5
L3_KEY_MAX_AGE = 180


def l3_site_id(site_id):
    """The L3 bucket keys use the site id as the frontend sends it (e.g. KGRR),
    but some site lists use the 3-letter form. Try as-is, fall back stripped."""
    return site_id.upper()


def get_latest_l3_key(site_id, product, date=None):
    site_id = l3_site_id(site_id)
    product = product.upper()
    if date is None:
        date = datetime.now(timezone.utc).strftime("%Y_%m_%d")

    prefixes = [f"{site_id}_{product}_{date}"]
    if site_id.startswith("K") and len(site_id) == 4:
        prefixes.append(f"{site_id[1:]}_{product}_{date}")

    now = time.monotonic()
    for prefix in prefixes:
        cache_key = (prefix,)
        with latest_key_lock:
            entry = latest_key_cache.get(cache_key)
            if entry and (now - entry["at"]) < L3_KEY_TTL:
                return entry["key"]
            last_key = entry["key"] if entry else None
            last_at = entry["at"] if entry else 0

        latest = None
        if last_key:
            try:
                inc, _ = _list_bucket(L3_BUCKET, prefix, max_keys=10, start_after=last_key)
            except Exception:
                inc = []
            if inc:
                latest = inc[-1]
            elif (now - last_at) < L3_KEY_MAX_AGE:
                latest = last_key

        if latest is None:
            keys, _ = _list_bucket(L3_BUCKET, prefix)
            if keys:
                latest = keys[-1]

        if latest:
            with latest_key_lock:
                latest_key_cache[cache_key] = {"key": latest, "at": now}
            return latest

    raise FileNotFoundError(f"No L3 radar files for {site_id}_{product}_{date}")

# ---------------------------------------------------------------------------
# Level 2: archive volume listing
# ---------------------------------------------------------------------------

def l2_site_id(site_id):
    s = site_id.upper()
    if len(s) == 3:
        s = "K" + s
    return s


def _parse_l2_key_time(key):
    m = L2_KEY_TIME_PATTERN.search(key.split("/")[-1])
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def list_l2_files(site_id, days_back=1, date=None):
    """List Level 2 volume files (newest last). Covers `days_back`+1 UTC days
    ending today, or a single specific date."""
    site = l2_site_id(site_id)
    cache_key = ("l2list", site, str(date), days_back)
    cached = listing_cache.get(cache_key)
    if cached and (time.monotonic() - cached["at"]) < 5:
        return cached["files"]

    if date is not None:
        dates = [date]
    else:
        today = datetime.now(timezone.utc).date()
        dates = [today - timedelta(days=i) for i in range(days_back, -1, -1)]

    files = []
    for d in dates:
        prefix = f"{d.year:04d}/{d.month:02d}/{d.day:02d}/{site}/"
        try:
            items = _list_all(L2_BUCKET, prefix, want_meta=True)
        except Exception:
            items = []
        for it in items:
            key = it["key"]
            if key.endswith("_MDM") or key.endswith(".tar"):
                continue
            ts = _parse_l2_key_time(key)
            if ts is None:
                continue
            files.append({"key": key, "timestamp": ts.isoformat().replace("+00:00", "Z")})

    files.sort(key=lambda f: f["timestamp"])
    listing_cache.put(cache_key, {"files": files, "at": time.monotonic()})
    return files

# ---------------------------------------------------------------------------
# File download with disk cache
# ---------------------------------------------------------------------------

def _safe_cache_path(key):
    return TEMP_DIR / key.replace("/", "__")


# Per-key download locks: the frontend fires several requests for the same
# radar key at once (radar-webgl, radar-latest-key, batch, tvs). Without a
# lock they all stream-download to the same temp file and race to rename it,
# producing "[Errno 2] No such file or directory: ...part -> ..." and corrupt
# data. The lock serializes downloads of a given key so only the first fetches
# and the rest reuse the finished file.
_download_locks = {}
_download_locks_guard = threading.Lock()


def _download_lock(key):
    with _download_locks_guard:
        lock = _download_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            # Bound the dict so a long broadcast session can't grow it forever.
            if len(_download_locks) > 4000:
                _download_locks.clear()
            _download_locks[key] = lock
        return lock


def download_file(bucket, key, use_cache=True):
    path = _safe_cache_path(key)
    if use_cache and path.exists() and path.stat().st_size > 0:
        return path

    with _download_lock(key):
        # Re-check inside the lock: another thread may have just finished.
        if use_cache and path.exists() and path.stat().st_size > 0:
            return path

        url = f"{bucket}/{key}"
        # Unique temp name (pid + thread) so even unexpected concurrency or a
        # second process can never collide on the same .part file.
        tmp = path.with_suffix(
            path.suffix + f".part.{os.getpid()}.{threading.get_ident()}"
        )
        resp = _http_get(url, stream=True)
        try:
            resp.raise_for_status()
            with open(tmp, "wb") as f:
                for chunk in resp.iter_content(256 * 1024):
                    if chunk:
                        f.write(chunk)
            os.replace(tmp, path)  # atomic on the same filesystem
        except Exception:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass
            raise
        finally:
            resp.close()
    return path


def cleanup_temp(max_age_hours=24, max_total_bytes=2 * 1024**3):
    """Drop cached files older than max_age_hours, then prune oldest files
    until the cache fits under max_total_bytes."""
    cutoff = time.time() - max_age_hours * 3600
    try:
        files = [p for p in TEMP_DIR.rglob("*") if p.is_file()]
        for p in files:
            if p.stat().st_mtime < cutoff:
                p.unlink(missing_ok=True)
        files = sorted((p for p in TEMP_DIR.rglob("*") if p.is_file()),
                       key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in files)
        while files and total > max_total_bytes:
            oldest = files.pop(0)
            total -= oldest.stat().st_size
            oldest.unlink(missing_ok=True)
    except Exception:
        pass


def _cleanup_loop():
    while True:
        time.sleep(3600)
        cleanup_temp()

# ---------------------------------------------------------------------------
# Site coordinates (subset used for polar->lonlat math)
# ---------------------------------------------------------------------------

SITE_COORDS_PATH = HERE / "site_coords.json"
try:
    with open(SITE_COORDS_PATH) as f:
        SITE_COORDS = json.load(f)
except Exception:
    SITE_COORDS = {}


def get_site_coordinates(site_id):
    s = site_id.upper()
    if s.startswith("K") and len(s) > 3:
        s = s[1:]
    return SITE_COORDS.get(s, {"lat": 39.8333333, "lon": -98.585522})

# ---------------------------------------------------------------------------
# Radar data extraction
# ---------------------------------------------------------------------------

def extract_l3(radar_data):
    """Return (azimuths, ranges_km, values 2D array) from a Level3File."""
    if not (hasattr(radar_data, "sym_block") and radar_data.sym_block):
        return None, None, None
    for layer in radar_data.sym_block:
        if not isinstance(layer, (list, tuple)):
            continue
        for packet in layer:
            if isinstance(packet, dict) and "start_az" in packet and "data" in packet:
                azimuths = np.asarray(packet["start_az"], dtype=np.float32)
                if hasattr(radar_data, "ij_to_km"):
                    gate_km = radar_data.ij_to_km
                else:
                    gate_km = packet.get("gate_scale", 1000) / 1000.0
                first_km = packet.get("first", 0) * gate_km
                num_bins = len(packet["data"][0]) if packet["data"] else 0
                ranges = np.linspace(first_km, first_km + (num_bins - 1) * gate_km,
                                     num_bins).astype(np.float32)
                try:
                    values = np.array([
                        radar_data.map_data(np.frombuffer(rb, dtype=np.uint8))
                        for rb in packet["data"]
                    ], dtype=np.float32)
                except Exception:
                    continue
                return azimuths, ranges, values
    return None, None, None


def _moment_for_product(product):
    p = (product or "N0B").upper()
    code = p[2] if len(p) >= 3 else "B"
    if code in VELOCITY_CODES:
        return "VEL"
    if code == "C":
        return "RHO"
    if code == "X":
        return "ZDR"
    return "REF"


def _moment_key(moments, name):
    """moments dict may be keyed by bytes or str."""
    for k in moments:
        kk = k.decode() if isinstance(k, (bytes, bytearray)) else str(k)
        if kk.strip().upper() == name:
            return k
    return None


def extract_l2(l2file, product="N0B", min_sweep=0, max_rays=None):
    """Return (azimuths, ranges_km, values, meta) for the lowest sweep
    containing the requested moment in a (possibly partial) Level2File."""
    moment = _moment_for_product(product)
    target_sweep = None
    sweep_index = None
    for i, sweep in enumerate(l2file.sweeps):
        if i < min_sweep or not sweep:
            continue
        with_moment = 0
        for ray in sweep[: min(10, len(sweep))]:
            moments = ray[-1] if isinstance(ray, tuple) else ray.moments
            if moments and _moment_key(moments, moment):
                with_moment += 1
        if with_moment > 0:
            target_sweep = sweep
            sweep_index = i
            break
    if target_sweep is None:
        return None, None, None, {}

    rays = target_sweep if max_rays is None else target_sweep[:max_rays]
    az_list, val_rows, max_gates = [], [], 0
    first_gate_km, gate_w_km, elevation = 0.0, 0.25, 0.0
    ray_times = None

    for ray in rays:
        hdr = ray[0] if isinstance(ray, tuple) else ray.header
        moments = ray[-1] if isinstance(ray, tuple) else ray.moments
        key = _moment_key(moments, moment) if moments else None
        if key is None:
            continue
        mhdr, vals = moments[key]
        az = getattr(hdr, "az_angle", None)
        if az is None:
            az = getattr(hdr, "az", 0.0)
        az_list.append(float(az))
        val_rows.append(np.asarray(vals, dtype=np.float32))
        max_gates = max(max_gates, len(vals))
        fg = getattr(mhdr, "first_gate", None)
        gw = getattr(mhdr, "gate_width", None)
        if fg is not None and gw is not None:
            # msg31 stores km (already scaled); legacy msg1 stores raw gate counts
            first_gate_km = float(fg) if float(fg) < 100 else float(fg) / 1000.0
            gate_w_km = float(gw) if float(gw) < 100 else float(gw) / 1000.0
        el = getattr(hdr, "el_angle", None)
        if el is not None:
            elevation = float(el)
        if ray_times is None:
            t_ms = getattr(hdr, "time_ms", None)
            t_date = getattr(hdr, "date", None)
            if t_ms is not None and t_date is not None:
                try:
                    ray_times = (datetime(1970, 1, 1, tzinfo=timezone.utc)
                                 + timedelta(days=int(t_date) - 1, milliseconds=int(t_ms)))
                except Exception:
                    ray_times = None

    if not az_list or max_gates == 0:
        return None, None, None, {}

    values = np.full((len(val_rows), max_gates), np.nan, dtype=np.float32)
    for i, row in enumerate(val_rows):
        values[i, : len(row)] = row

    azimuths = np.asarray(az_list, dtype=np.float32)
    ranges = (first_gate_km + np.arange(max_gates, dtype=np.float32) * gate_w_km).astype(np.float32)

    meta = {
        "sweepIndex": sweep_index,
        "elevation": elevation,
        "moment": moment,
        "timestamp": ray_times.isoformat().replace("+00:00", "Z") if ray_times else None,
    }
    return azimuths, ranges, values, meta


MS_TO_MPH = 2.2369362921  # the NEXRAD parsers yield velocity in m/s


def _apply_value_filter(values, product):
    """NaN-out values the renderer should discard, and convert velocity from
    the parser's native m/s to mph — the frontend velocity color ramp and the
    legend are both in mph, so unconverted m/s only reached the middle of the
    ramp and every velocity rendered as a similar washed-out color."""
    moment_is_velocity = _moment_for_product(product) == "VEL"
    out = values.astype(np.float32, copy=True)
    if moment_is_velocity:
        out[out == -999] = np.nan
        out *= MS_TO_MPH
    else:
        out[out <= 0] = np.nan
    return out

# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------

def build_radial_payload(mesh_id, azimuths, ranges, values):
    """RADR binary payload (see parseRadialBinaryPayload in app.js).

    Rays are SORTED by azimuth before sending. A NEXRAD volume starts at
    whatever azimuth the antenna happened to be at, so successive volumes
    have the same ray count but different starting angles. The client caches
    its render mesh keyed on ray count and reuses it across frames — if the
    rays aren't in a canonical order, each frame's values land on the wrong
    angular cells and the display appears ROTATED (and scrubbing looks like
    the radar is spinning). Sorting ascending gives every frame the identical
    azimuth[i]≈i*Δ layout, so the cached mesh is valid for all of them.
    """
    az = np.ascontiguousarray(azimuths, dtype=np.float32)
    rng = np.ascontiguousarray(ranges, dtype=np.float32)
    vals2d = np.ascontiguousarray(values, dtype=np.float32).reshape(len(az), len(rng))

    order = np.argsort(az, kind="stable")
    az = np.ascontiguousarray(az[order])
    vals2d = np.ascontiguousarray(vals2d[order])

    vals = vals2d.reshape(len(az) * len(rng))
    mesh_bytes = mesh_id.encode("utf-8")

    header = struct.pack(
        "<IHHIIHH",
        RADIAL_MAGIC, 1, 0, len(az), len(rng), len(mesh_bytes), 0,
    )
    return b"".join([header, mesh_bytes, az.tobytes(), rng.tobytes(), vals.tobytes()])


def build_triangle_payload(site_coords, azimuths, ranges, values):
    """Triangle binary payload: [uint32 count][float32 verts][float32 vals]."""
    az = np.asarray(azimuths, dtype=np.float64)
    rng = np.asarray(ranges, dtype=np.float64)
    vals = np.asarray(values, dtype=np.float32)

    az_start = az
    az_end = np.roll(az, -1)
    az_diff = (az_end - az_start) % 360
    valid_az = az_diff < 10

    n_az = len(az)
    n_gates = len(rng) - 1
    if n_gates <= 0 or not np.any(valid_az):
        return _pack_triangles(np.empty(0, np.float32), np.empty(0, np.float32))

    gate_vals = vals[:, :n_gates]
    mask = np.isfinite(gate_vals) & valid_az[:, None]
    ai, gi = np.nonzero(mask)
    if len(ai) == 0:
        return _pack_triangles(np.empty(0, np.float32), np.empty(0, np.float32))

    lat0 = site_coords["lat"]
    lon0 = site_coords["lon"]
    deg_per_km_lat = 1.0 / 110.574
    deg_per_km_lon = 1.0 / (111.32 * max(0.1, np.cos(np.radians(lat0))))

    a0 = np.radians(az_start[ai])
    a1 = np.radians(az_end[ai])
    r0 = rng[gi]
    r1 = rng[gi + 1]

    sin0, cos0 = np.sin(a0), np.cos(a0)
    sin1, cos1 = np.sin(a1), np.cos(a1)

    def corner(r, s, c):
        lon = lon0 + (r * s) * deg_per_km_lon
        lat = lat0 + (r * c) * deg_per_km_lat
        return lon, lat

    x0, y0 = corner(r0, sin0, cos0)
    x1, y1 = corner(r1, sin0, cos0)
    x2, y2 = corner(r1, sin1, cos1)
    x3, y3 = corner(r0, sin1, cos1)

    n = len(ai)
    verts = np.empty(n * 12, dtype=np.float32)
    verts[0::12], verts[1::12] = x0, y0
    verts[2::12], verts[3::12] = x1, y1
    verts[4::12], verts[5::12] = x2, y2
    verts[6::12], verts[7::12] = x0, y0
    verts[8::12], verts[9::12] = x2, y2
    verts[10::12], verts[11::12] = x3, y3

    tri_vals = np.repeat(gate_vals[ai, gi].astype(np.float32), 6)
    return _pack_triangles(verts, tri_vals)


def _pack_triangles(verts, vals):
    count = len(vals)
    return b"".join([struct.pack("<I", count), verts.tobytes(), vals.tobytes()])

# ---------------------------------------------------------------------------
# Processing pipeline (with payload caching)
# ---------------------------------------------------------------------------

# Bump when the payload-building logic changes (units, geometry, filtering)
# so stale cached .bin files on disk are ignored instead of served forever.
PAYLOAD_CACHE_VERSION = "v3-azsort"


def process_payload(site_id, product, source, transport, key):
    """Produce the binary payload for one radar scan. Heavily cached."""
    cache_id = f"{PAYLOAD_CACHE_VERSION}|{source}|{transport}|{product}|{key}"
    cached = payload_cache.get(cache_id)
    if cached is not None:
        return cached

    disk = PROCESSED_DIR / (re.sub(r"[^A-Za-z0-9_.-]", "_", cache_id) + ".bin")
    if disk.exists() and disk.stat().st_size > 8:
        payload = disk.read_bytes()
        payload_cache.put(cache_id, payload)
        return payload

    site_coords = get_site_coordinates(site_id)

    if source == "level2":
        path = download_file(L2_BUCKET, key)
        f = nexrad.Level2File(str(path))
        az, rng, vals, _meta = extract_l2(f, product)
    else:
        path = download_file(L3_BUCKET, key)
        f = nexrad.Level3File(str(path))
        az, rng, vals = extract_l3(f)

    if az is None:
        payload = _pack_triangles(np.empty(0, np.float32), np.empty(0, np.float32))
        payload_cache.put(cache_id, payload)
        return payload

    vals = _apply_value_filter(vals, product)

    if transport == "radial":
        mesh_id = f"{site_id}:{product}:{len(az)}x{len(rng)}:{rng[0]:.3f}:{(rng[1]-rng[0]) if len(rng) > 1 else 0:.4f}"
        payload = build_radial_payload(mesh_id, az, rng, vals)
    else:
        payload = build_triangle_payload(site_coords, az, rng, vals)

    payload_cache.put(cache_id, payload)
    try:
        disk.write_bytes(payload)
    except Exception:
        pass
    return payload

# ---------------------------------------------------------------------------
# API: health
# ---------------------------------------------------------------------------

@app.route("/", methods=["GET"])
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "radar-api", "time": datetime.now(timezone.utc).isoformat()})

# ---------------------------------------------------------------------------
# API: latest key
# ---------------------------------------------------------------------------

@app.route("/api/radar-latest-key/<site_id>", methods=["GET"])
def api_latest_key(site_id):
    product = request.args.get("product", "N0B")
    source = request.args.get("source", "level3")
    try:
        if source == "level2":
            files = list_l2_files(site_id, days_back=1)
            if not files:
                return jsonify({"error": "No Level 2 files found"}), 404
            return jsonify({"key": files[-1]["key"], "timestamp": files[-1]["timestamp"]})
        key = get_latest_l3_key(site_id, product)
        return jsonify({"key": key})
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ---------------------------------------------------------------------------
# API: Level 2 file list
# ---------------------------------------------------------------------------

@app.route("/api/radar-level2-files/<site_id>", methods=["GET"])
def api_l2_files(site_id):
    limit = int(request.args.get("limit", 500))
    date_str = request.args.get("date")
    try:
        date = None
        if date_str:
            date = datetime.strptime(date_str, "%Y-%m-%d").date()
        files = list_l2_files(site_id, days_back=1, date=date)
        files = files[-limit:]
        return jsonify({"siteId": l2_site_id(site_id), "count": len(files), "files": files})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ---------------------------------------------------------------------------
# API: WebGL payload (single)
# ---------------------------------------------------------------------------

@app.route("/api/radar-webgl/<site_id>", methods=["GET"])
def api_radar_webgl(site_id):
    product = request.args.get("product", "N0B")
    source = request.args.get("source", "level3")
    transport = request.args.get("transport", "triangles")
    fmt = request.args.get("format", "binary")
    key = request.args.get("key")

    try:
        if not key:
            if source == "level2":
                files = list_l2_files(site_id, days_back=1)
                if not files:
                    return jsonify({"error": "No Level 2 files found"}), 404
                key = files[-1]["key"]
            else:
                key = get_latest_l3_key(site_id, product)

        payload = process_payload(site_id, product, source, transport, key)

        if fmt == "binary":
            body = payload
            headers = {
                "Cache-Control": "public, max-age=86400, immutable",
                "X-Radar-Key": key,
            }
            accepts_gzip = "gzip" in (request.headers.get("Accept-Encoding") or "")
            if accepts_gzip and len(payload) > 64 * 1024:
                body = gzip.compress(payload, compresslevel=4)
                headers["Content-Encoding"] = "gzip"
            resp = Response(body, mimetype="application/octet-stream", headers=headers)
            return resp

        # JSON fallback (triangles only)
        count = struct.unpack_from("<I", payload, 0)[0]
        verts = np.frombuffer(payload, dtype=np.float32, count=count * 2, offset=4)
        vals = np.frombuffer(payload, dtype=np.float32, count=count, offset=4 + count * 8)
        return jsonify({"vertices": verts.tolist(), "values": vals.tolist(), "key": key})
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ---------------------------------------------------------------------------
# API: WebGL payload (batch)
# ---------------------------------------------------------------------------

batch_pool = ThreadPoolExecutor(max_workers=8)


@app.route("/api/radar-webgl-batch/<site_id>", methods=["POST"])
def api_radar_webgl_batch(site_id):
    body = request.get_json(force=True, silent=True) or {}
    product = body.get("product", "N0B")
    source = body.get("source", "level3")
    transport = body.get("transport", "triangles")
    keys = body.get("keys") or []
    include_payload = bool(body.get("includePayload", True))
    use_gzip = bool(body.get("gzip", False))

    if not isinstance(keys, list) or not keys:
        return jsonify({"error": "keys must be a non-empty list"}), 400
    keys = [str(k) for k in keys][:120]

    def work(key):
        try:
            payload = process_payload(site_id, product, source, transport, key)
            entry = {"key": key, "status": "ok", "byteLength": len(payload)}
            if include_payload:
                if use_gzip:
                    payload = gzip.compress(payload, compresslevel=4)
                entry["payloadBase64"] = base64.b64encode(payload).decode("ascii")
                entry["isGzipped"] = use_gzip
            return entry
        except Exception as e:
            return {"key": key, "status": "error", "error": str(e)}

    results = list(batch_pool.map(work, keys))
    ok = sum(1 for r in results if r["status"] == "ok")
    return jsonify({"siteId": site_id, "count": len(results), "ok": ok, "results": results})

# ---------------------------------------------------------------------------
# API: live Level 2 SSE stream (Arc-Sync)
# ---------------------------------------------------------------------------

def _chunk_sort_key(key):
    name = key.rsplit("/", 1)[-1]          # 20260611-081205-001-S
    parts = name.split("-")
    try:
        return (parts[0], parts[1], int(parts[2]))
    except Exception:
        return (name, "", 0)


_live_volume_cache = {}
_live_volume_lock = threading.Lock()


def _chunk_time(key):
    """UTC timestamp string from a chunk filename (20260611-194232-...)."""
    name = key.rsplit("/", 1)[-1]
    return name[:15]


def _find_live_volume(site):
    """Find the chunk-bucket volume dir with the newest start time.

    The bucket retains ~2 days of volumes and keys sort by volume number
    (which wraps at 999), so the newest volume must be found by the
    timestamp embedded in the chunk filenames. A full scan is ~20-40 list
    requests; the result is cached so reconnects resume instantly.
    """
    with _live_volume_lock:
        cached = _live_volume_cache.get(site)
    start_after = None
    if cached and (time.monotonic() - cached["at"]) < 3600:
        # resume scanning from just before the last known volume
        start_after = cached["vol_dir"] + "/"

    def scan(after):
        newest_key, items, token, pages = None, [], None, 0
        while pages < 60:
            batch, token = _list_bucket(L2_CHUNK_BUCKET, f"{site}/",
                                        start_after=after if pages == 0 else None,
                                        continuation=token)
            items.extend(batch)
            pages += 1
            if not token:
                break
        if not items:
            return None, []
        newest_key = max(items, key=_chunk_time)
        vol = "/".join(newest_key.split("/")[:2])
        chunks = sorted((k for k in items if k.startswith(vol + "/")), key=_chunk_sort_key)
        return vol, chunks

    vol_dir, chunk_keys = scan(start_after)
    if start_after is not None:
        # the cached volume might have wrapped past 999; verify against a
        # fresh full scan if the resumed scan found nothing newer
        if vol_dir is None:
            vol_dir, chunk_keys = scan(None)

    if vol_dir:
        with _live_volume_lock:
            _live_volume_cache[site] = {"vol_dir": vol_dir, "at": time.monotonic()}
    return vol_dir, chunk_keys


def _next_volume_dir(vol_dir):
    site, num = vol_dir.split("/")
    nxt = int(num) + 1
    if nxt > 999:
        nxt = 1
    return f"{site}/{nxt:03d}"


def _download_chunk(key):
    resp = _http_get(f"{L2_CHUNK_BUCKET}/{key}")
    resp.raise_for_status()
    return resp.content


def _sse_event(obj):
    return f"data: {json.dumps(obj)}\n\n"


@app.route("/api/radar/level2-stream", methods=["GET"])
def api_level2_stream():
    site = l2_site_id(request.args.get("site", "KGRR"))
    product = request.args.get("product", "N0B")
    site_coords = get_site_coordinates(site)

    def generate():
        vol_dir = None
        chunk_buffer = b""
        seen_chunks = set()
        emitted_rays = 0
        session_key = None
        saw_end = False
        last_keepalive = time.monotonic()
        last_parse_rays = 0

        yield _sse_event({"status": "connected", "site": site, "product": product})

        while True:
            try:
                # --- discover / roll volumes ---
                if vol_dir is None:
                    vol_dir, chunk_keys = _find_live_volume(site)
                    if vol_dir is None:
                        yield _sse_event({"error": f"No live Level 2 chunks for {site}"})
                        time.sleep(5)
                        continue
                    chunk_buffer = b""
                    seen_chunks = set()
                    emitted_rays = 0
                    last_parse_rays = 0
                    saw_end = False
                    session_key = None
                else:
                    chunk_keys = sorted(
                        _list_all(L2_CHUNK_BUCKET, vol_dir + "/", max_pages=2),
                        key=_chunk_sort_key,
                    )

                new_chunks = [k for k in chunk_keys if k not in seen_chunks]
                got_new = False
                for key in new_chunks:
                    try:
                        data = _download_chunk(key)
                    except Exception:
                        continue
                    seen_chunks.add(key)
                    # First chunk of a volume carries the 24-byte volume header
                    if key.endswith("-S") or not chunk_buffer:
                        if key.endswith("-S"):
                            chunk_buffer = data
                            session_key = key.rsplit("-", 2)[0]  # SITE/NNN/date-time
                            emitted_rays = 0
                            last_parse_rays = 0
                        else:
                            chunk_buffer += data
                    else:
                        chunk_buffer += data
                    if key.endswith("-E"):
                        saw_end = True
                    got_new = True

                # --- parse & emit deltas ---
                if got_new and chunk_buffer:
                    try:
                        f = nexrad.Level2File(io.BytesIO(chunk_buffer))
                        az, rng, vals, meta = extract_l2(f, product)
                    except Exception:
                        az = None
                        meta = {}

                    if az is not None and len(az) > last_parse_rays:
                        total = len(az)
                        start = max(emitted_rays - 1, 0)
                        sub_az = az[start: total]
                        sub_vals = _apply_value_filter(vals[start: total], product)
                        sweep_done = bool(meta.get("sweepIndex", 0) is not None and saw_end) or \
                            (len(f.sweeps) > (meta.get("sweepIndex", 0) + 1))

                        # build triangles for the new wedge only (no wraparound pair)
                        if len(sub_az) >= 2:
                            payload = build_triangle_payload(
                                site_coords,
                                sub_az, rng, sub_vals,
                            )
                            count = struct.unpack_from("<I", payload, 0)[0]
                            verts_b = payload[4: 4 + count * 8]
                            vals_b = payload[4 + count * 8: 4 + count * 8 + count * 4]
                            yield _sse_event({
                                "sessionKey": session_key or vol_dir,
                                "verticesB64": base64.b64encode(verts_b).decode("ascii"),
                                "valuesB64": base64.b64encode(vals_b).decode("ascii"),
                                "verticesCount": count * 2,
                                "valuesCount": count,
                                "verticesDtype": "float32",
                                "valuesDtype": "float32",
                                "rayCount": total,
                                "totalRays": 720,
                                "sweepCoverageDeg": min(360.0, total * 0.5),
                                "sweepComplete": sweep_done,
                                "sweepIndex": meta.get("sweepIndex", 0),
                                "elevation": meta.get("elevation", 0.0),
                                "timestamp": meta.get("timestamp"),
                                "totalBytes": len(chunk_buffer),
                            })
                            emitted_rays = total
                            last_keepalive = time.monotonic()
                        last_parse_rays = len(az)

                # --- roll to next volume after end chunk ---
                if saw_end and not new_chunks:
                    nxt = _next_volume_dir(vol_dir)
                    nxt_keys = sorted(
                        _list_all(L2_CHUNK_BUCKET, nxt + "/", max_pages=1),
                        key=_chunk_sort_key,
                    )
                    # Only roll when the next volume's start chunk is newer
                    if nxt_keys and any(k.endswith("-S") for k in nxt_keys):
                        vol_dir = nxt
                        chunk_buffer = b""
                        seen_chunks = set()
                        emitted_rays = 0
                        last_parse_rays = 0
                        saw_end = False
                        session_key = None
                        with _live_volume_lock:
                            _live_volume_cache[site] = {"vol_dir": vol_dir, "at": time.monotonic()}
                        continue

                if (time.monotonic() - last_keepalive) > 15:
                    yield _sse_event({"keepalive": True, "sessionKey": session_key or vol_dir})
                    last_keepalive = time.monotonic()

                time.sleep(2.0)
            except GeneratorExit:
                return
            except Exception as e:
                yield _sse_event({"error": str(e)})
                time.sleep(5)

    resp = Response(generate(), mimetype="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"
    return resp

# ---------------------------------------------------------------------------
# API: archive
# ---------------------------------------------------------------------------

def fetch_archive_scans(site_id, product, date_str):
    try:
        target = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError as err:
        raise ValueError("Invalid date format. Use YYYY-MM-DD.") from err

    prefix = f"{l3_site_id(site_id)}_{product.upper()}_{target.strftime('%Y_%m_%d')}"
    items = _list_all(L3_BUCKET, prefix, want_meta=True)
    if not items and site_id.upper().startswith("K"):
        prefix = f"{site_id.upper()[1:]}_{product.upper()}_{target.strftime('%Y_%m_%d')}"
        items = _list_all(L3_BUCKET, prefix, want_meta=True)

    scans = []
    for it in items:
        m = TIMESTAMP_PATTERN.search(it["key"])
        if not m:
            continue
        y, mo, d, h, mi, s = map(int, m.groups())
        ts = datetime(y, mo, d, h, mi, s, tzinfo=timezone.utc)
        scans.append({
            "key": it["key"],
            "timestamp": ts.isoformat().replace("+00:00", "Z"),
            "timeString": ts.strftime("%H:%M:%S UTC"),
            "sizeBytes": it["size"],
            "lastModified": it["lastModified"],
            "fileName": it["key"].split("/")[-1],
        })
    scans.sort(key=lambda s: s["timestamp"])
    return scans


@app.route("/api/archive/timestamps/<site_id>", methods=["GET"])
def api_archive_timestamps(site_id):
    product = request.args.get("product", "N0B")
    date_str = request.args.get("date")
    source = request.args.get("source", "level3")
    if not date_str:
        return jsonify({"error": "Missing required 'date' query parameter (YYYY-MM-DD)."}), 400
    try:
        if source == "level2":
            date = datetime.strptime(date_str, "%Y-%m-%d").date()
            files = list_l2_files(site_id, date=date)
            scans = [{
                "key": f["key"],
                "timestamp": f["timestamp"],
                "timeString": f["timestamp"][11:19] + " UTC",
                "fileName": f["key"].split("/")[-1],
            } for f in files]
        else:
            scans = fetch_archive_scans(site_id, product, date_str)
        return jsonify({
            "siteId": site_id, "product": product, "date": date_str,
            "count": len(scans), "scans": scans,
        })
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch archive scans."}), 500


@app.route("/api/archive/file", methods=["GET"])
def api_archive_file():
    key = request.args.get("key")
    source = request.args.get("source", "level3")
    if not key:
        return jsonify({"error": "Missing required 'key' query parameter."}), 400
    try:
        bucket = L2_BUCKET if source == "level2" else L3_BUCKET
        path = download_file(bucket, key)
        return send_file(path, as_attachment=True, download_name=Path(path).name)
    except Exception as err:
        traceback.print_exc()
        return jsonify({"error": str(err)}), 500

# --- IEM warning archive (unchanged contract from legacy API) ---

LATLON_PATTERN = re.compile(r"LAT\.{3}LON\s+([0-9\s]+)")
EVENT_PATTERN = re.compile(r"^(Tornado Warning|Severe Thunderstorm Warning)$", re.IGNORECASE | re.MULTILINE)
HAZARD_PATTERN = re.compile(r"^\s*HAZARD\.{3}\s*(.+)$", re.MULTILINE)
SOURCE_PATTERN = re.compile(r"^\s*SOURCE\.{3}\s*(.+)$", re.MULTILINE)
TIMEMOTLOC_PATTERN = re.compile(r"^\s*TIME\.{3}MOT\.{3}LOC\s*(.+)$", re.MULTILINE)
VTEC_PATTERN = re.compile(
    r"/([A-Z])\.([A-Z]{3})\.([A-Z]{4})\.([A-Z]{2})\.([A-Z])\.([0-9]{4})\.([0-9]{6}T[0-9]{4}Z)-([0-9]{6}T[0-9]{4}Z)/"
)


def parse_warning_text(text):
    vtec_match = VTEC_PATTERN.search(text)
    vtec_code = phenomena = significance = None
    onset = expires = None
    if vtec_match:
        vtec_code = vtec_match.group(0)
        phenomena = vtec_match.group(4)
        significance = vtec_match.group(5)
        try:
            onset = datetime.strptime(vtec_match.group(7), "%y%m%dT%H%MZ").replace(tzinfo=timezone.utc)
            expires = datetime.strptime(vtec_match.group(8), "%y%m%dT%H%MZ").replace(tzinfo=timezone.utc)
        except Exception:
            pass

    m_event = EVENT_PATTERN.search(text)
    coords = []
    m_latlon = LATLON_PATTERN.search(text)
    if m_latlon:
        nums = m_latlon.group(1).strip().split()
        for i in range(0, len(nums) - 1, 2):
            try:
                lat = float(nums[i][:2] + "." + nums[i][2:])
                lon = -float(nums[i + 1][:2] + "." + nums[i + 1][2:])
                coords.append([lon, lat])
            except Exception:
                continue
        if coords and coords[0] != coords[-1]:
            coords.append(coords[0])

    def _first(pattern):
        m = pattern.search(text)
        return m.group(1).strip() if m else None

    return {
        "eventName": m_event.group(1) if m_event else None,
        "vtecCode": vtec_code,
        "phenomena": phenomena,
        "significance": significance,
        "onset": onset.isoformat() if onset else None,
        "expires": expires.isoformat() if expires else None,
        "polygon": coords or None,
        "hazard": _first(HAZARD_PATTERN),
        "source": _first(SOURCE_PATTERN),
        "timeMotLoc": _first(TIMEMOTLOC_PATTERN),
    }


@app.route("/api/archive/warnings", methods=["GET"])
def api_archive_warnings():
    date_str = request.args.get("date")
    time_str = request.args.get("time")
    pil = request.args.get("pil", "TOR")
    cccc = request.args.get("cccc")
    if not date_str:
        return jsonify({"error": "Missing required 'date' query parameter (YYYY-MM-DD)."}), 400

    try:
        params = {"pil": pil, "date": date_str}
        if cccc:
            params["cccc"] = cccc
        rows = _http_get(f"{IEM_BASE}/nws/afos/list.json", params=params).json().get("data", [])

        radar_time = None
        if time_str:
            radar_time = datetime.fromisoformat(f"{date_str}T{time_str}+00:00")

        def fetch_one(row):
            pid = row.get("product_id")
            if not pid:
                return None
            try:
                text = _http_get(f"{IEM_BASE}/nwstext/{pid}").text
            except Exception:
                return None
            parsed = parse_warning_text(text)
            if parsed.get("phenomena") not in ("TO", "SV") or not parsed.get("polygon"):
                return None
            if radar_time and parsed.get("onset") and parsed.get("expires"):
                try:
                    onset = datetime.fromisoformat(parsed["onset"])
                    expires = datetime.fromisoformat(parsed["expires"])
                    if not (onset <= radar_time <= expires):
                        return None
                except Exception:
                    return None
            return {
                "id": pid, "pil": row.get("pil"), "cccc": row.get("cccc"),
                "entered": row.get("entered"), "event": parsed.get("eventName"),
                "text": text, **{k: parsed.get(k) for k in (
                    "vtecCode", "phenomena", "significance", "onset", "expires",
                    "polygon", "hazard", "source", "timeMotLoc")},
            }

        alerts = [a for a in batch_pool.map(fetch_one, rows) if a]
        return jsonify({"date": date_str, "pil": pil, "count": len(alerts), "alerts": alerts})
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch warnings from IEM."}), 500

# ---------------------------------------------------------------------------
# API: TVS detections (NSSL TDA-lite over Level 2 velocity volumes)
# ---------------------------------------------------------------------------

_tvs_cache = LRUCache(max_items=40)


@app.route("/api/tvs/<site_id>", methods=["GET"])
def api_tvs(site_id):
    key = request.args.get("key")
    try:
        if not key:
            files = list_l2_files(site_id, days_back=0)
            if not files:
                return jsonify({"error": "No Level 2 volumes available"}), 404
            key = files[-1]["key"]

        cached = _tvs_cache.get(key)
        if cached is not None:
            return jsonify(cached)

        path = download_file(L2_BUCKET, key)
        f = nexrad.Level2File(str(path))
        site_coords = get_site_coordinates(site_id)
        ts = _parse_l2_key_time(key)
        detections = tda.detect_tvs(f, site_coords, site_id=l2_site_id(site_id), volume_time=ts)
        result = {
            "siteId": l2_site_id(site_id),
            "volumeKey": key,
            "timestamp": ts.isoformat().replace("+00:00", "Z") if ts else None,
            "count": len(detections),
            "detections": detections,
        }
        _tvs_cache.put(key, result)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ---------------------------------------------------------------------------
# API: WPC surface fronts (parsed from the CODSUS coded bulletin via IEM)
# ---------------------------------------------------------------------------

FRONT_TYPES = {"COLD", "WARM", "STNRY", "OCFNT", "TROF", "DRYLINE"}
FRONT_QUALIFIERS = {"WK", "MDT", "STG"}
_fronts_cache = {"at": 0.0, "data": None}
_fronts_lock = threading.Lock()


def _codsus_coord(tok):
    """Decode a CODSUS lat/lon group. 4/5 digits = whole degrees
    (LL / LLL), 6/7 digits = tenths (LLLNNNN). Returns [lon, lat]."""
    if not tok.isdigit():
        return None
    n = len(tok)
    if n == 4:
        lat, lon = int(tok[:2]), int(tok[2:])
    elif n == 5:
        lat, lon = int(tok[:2]), int(tok[2:])
    elif n == 6:
        lat, lon = int(tok[:3]) / 10.0, int(tok[3:]) / 10.0
    elif n == 7:
        lat, lon = int(tok[:3]) / 10.0, int(tok[3:]) / 10.0
    else:
        return None
    if not (5 <= lat <= 85 and 30 <= lon <= 180):
        return None
    return [-lon, lat]


def parse_codsus(text):
    fronts, highs, lows = [], [], []
    valid = None
    current = None
    mode = None  # 'HIGHS' | 'LOWS' | front

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        tokens = line.split()
        first = tokens[0].upper()

        if first == "VALID" and len(tokens) > 1:
            valid = tokens[1]
            continue

        if first in ("HIGHS", "LOWS"):
            mode = first
            tokens = tokens[1:]
            current = None
        elif first in FRONT_TYPES:
            current = {"type": first.lower(), "strength": None, "coords": []}
            fronts.append(current)
            mode = "FRONT"
            tokens = tokens[1:]
            if tokens and tokens[0].upper() in FRONT_QUALIFIERS:
                current["strength"] = tokens[0].upper()
                tokens = tokens[1:]
        elif not first.isdigit():
            mode = None
            continue

        if mode in ("HIGHS", "LOWS"):
            # alternating pressure (900-1090) / coordinate groups
            pending_pressure = None
            for tok in tokens:
                if not tok.isdigit():
                    continue
                v = int(tok)
                if pending_pressure is None and 900 <= v <= 1090 and len(tok) <= 4:
                    pending_pressure = v
                    continue
                coord = _codsus_coord(tok)
                if coord and pending_pressure is not None:
                    (highs if mode == "HIGHS" else lows).append(
                        {"pressure": pending_pressure, "lon": coord[0], "lat": coord[1]}
                    )
                    pending_pressure = None
        elif mode == "FRONT" and current is not None:
            for tok in tokens:
                coord = _codsus_coord(tok)
                if coord:
                    current["coords"].append(coord)

    fronts = [f for f in fronts if len(f["coords"]) >= 2]
    return {"valid": valid, "fronts": fronts, "highs": highs, "lows": lows}


@app.route("/api/fronts", methods=["GET"])
def api_fronts():
    now = time.monotonic()
    with _fronts_lock:
        if _fronts_cache["data"] and (now - _fronts_cache["at"]) < 600:
            return jsonify(_fronts_cache["data"])
    try:
        rows = []
        for delta in (0, 1):
            day = (datetime.now(timezone.utc) - timedelta(days=delta)).strftime("%Y-%m-%d")
            resp = _http_get(f"{IEM_BASE}/nws/afos/list.json", params={"pil": "CODSUS", "date": day})
            rows = resp.json().get("data", [])
            if rows:
                break
        if not rows:
            return jsonify({"error": "No CODSUS bulletin available"}), 404
        pid = rows[-1]["product_id"]
        text = _http_get(f"{IEM_BASE}/nwstext/{pid}").text
        data = parse_codsus(text)
        data["productId"] = pid
        with _fronts_lock:
            _fronts_cache.update(at=now, data=data)
        return jsonify(data)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ---------------------------------------------------------------------------
# API: HRRR placeholders (model layer not available in this build)
# ---------------------------------------------------------------------------

@app.route("/api/hrrr-runs", methods=["GET"])
@app.route("/api/hrrr-webgl", methods=["GET"])
@app.route("/api/hrrr-precache", methods=["GET", "POST"])
def api_hrrr_stub():
    return jsonify({"error": "HRRR model data is not available in this build", "runs": []}), 404

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    cleanup_temp()
    threading.Thread(target=_cleanup_loop, daemon=True).start()
    port = int(os.environ.get("RADAR_API_PORT", "5100"))
    print(f"radar-api listening on http://127.0.0.1:{port}")
    try:
        from waitress import serve
        serve(app, host="127.0.0.1", port=port, threads=16)
    except ImportError:
        app.run(host="127.0.0.1", port=port, threaded=True, debug=False)
    except OSError as e:
        if getattr(e, "errno", None) == 48 or "Address already in use" in str(e):
            print(
                f"\nPort {port} is already in use — another radar-api instance "
                "is probably running and can be used as-is.\n"
                f"To replace it: pkill -f 'radar-api/app.py' && re-run, or set "
                "RADAR_API_PORT to use a different port."
            )
            raise SystemExit(1)
        raise
