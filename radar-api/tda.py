# radar-api/tda.py
# Tornado Detection Algorithm ("TDA-lite") over NEXRAD Level 2 volumes.
#
# Modeled on the NSSL TDA (Mitchell et al. 1998; Trapp et al. 1999), which
# replaced the legacy WSR-88D build-9 TVS algorithm. Key points taken from
# the source papers:
#
#  - The detection unit is GATE-TO-GATE differential velocity (delta-V):
#    the radial-velocity change at constant range across ADJACENT azimuths
#    (Trapp et al. 1999, sec. 1). The legacy algorithm's use of mesocyclone
#    velocity extrema separated by multiple radials systematically
#    underestimates shear (Vasiloff parameter study, sec. 2).
#  - Shear segments require delta-V >= 11 m/s; stronger thresholds are then
#    applied when building features (Mitchell et al. 1998).
#  - Operational "manual TVS" criteria (WSR-88D Operator's Guide, quoted in
#    Trapp et al. 1999, footnote 1): gate-to-gate delta-V >= 36 m/s (70 kt)
#    at 56-93 km range, or >= 46 m/s (90 kt) inside 56 km, observed through
#    at least the LOWEST TWO elevation angles.
#  - TVSs may be nondescending (first appear at low levels, common in QLCS
#    events — Trapp et al. 1999), so low-level detection alone must be able
#    to trigger: we classify a detection as TVS when its base is on the
#    lowest tilt, ETVS ("elevated") otherwise.
#
# Practical guards added for raw Level 2 data:
#  - Nyquist unfolding of gate-to-gate pairs (raw L2 velocity is aliased).
#  - The couplet must contain real inbound AND outbound flow (opposite
#    signs), which kills outflow-boundary / noise false positives.
#  - Despeckling: each side of the couplet must be range-continuous.

import math
from collections import defaultdict

import numpy as np
from scipy.ndimage import uniform_filter


def _nan_box_smooth(field, size=(1, 5)):
    """NaN-aware box smoothing: mean of finite values in the window.
    Default smooths along RANGE only — a genuine TVS is azimuthally tight
    (gate-to-gate), so azimuthal smoothing would erase the couplet itself,
    but each side of a real couplet is range-coherent while turbine/clutter
    contamination is range-isolated speckle."""
    finite = np.isfinite(field)
    filled = np.where(finite, field, 0.0).astype(np.float32)
    s = uniform_filter(filled, size=size, mode="nearest")
    w = uniform_filter(finite.astype(np.float32), size=size, mode="nearest")
    with np.errstate(invalid="ignore", divide="ignore"):
        out = s / w
    out[w < 0.3] = np.nan  # window mostly empty
    return out

SEGMENT_DV = 11.0          # m/s, minimum shear segment (Mitchell et al. 1998)
FEATURE_DV = 22.0          # m/s, minimum clustered 2D feature strength
TVS_DV_NEAR = 46.0         # m/s, manual-TVS threshold inside 56 km
TVS_DV_MID = 36.0          # m/s, manual-TVS threshold 56-93 km
NEAR_RANGE_KM = 56.0
MID_RANGE_KM = 93.0
MIN_RANGE_KM = 8.0         # ignore clutter right at the dish
MAX_RANGE_KM = 150.0       # beam too wide beyond this for gate-to-gate TVS
MIN_SIDE_SPEED = 7.0       # m/s, each side of the couplet must be moving
MAX_AZ_GAP_DEG = 1.6       # adjacent radials only (gate-to-gate)
CLUSTER_RANGE_KM = 2.5     # 2D feature clustering tolerance
CLUSTER_AZ_DEG = 3.0
VERT_ASSOC_KM = 2.5        # max horizontal offset between tilts
MIN_SEGMENTS_2D = 3        # segments needed to form a 2D feature
MAX_TILTS = 6              # scan the lowest N velocity tilts
DEPTH_RULE_BASE_DV = 30.0  # m/s, minimum base strength for deep features
DEPTH_RULE_MAX_DV = 36.0   # m/s, minimum column strength for deep features


def _extract_vel_sweep(sweep):
    """Pull (azimuths, velocities[ray, gate], first_gate_km, gate_w_km,
    elevation_deg, nyquist) from one Level2File sweep. Returns None if the
    sweep has no velocity moment."""
    az, rows, max_gates = [], [], 0
    first_km, gate_km, elev, nyq = None, None, None, None
    for ray in sweep:
        hdr = ray[0] if isinstance(ray, tuple) else ray.header
        moments = ray[-1] if isinstance(ray, tuple) else ray.moments
        if not moments:
            continue
        key = None
        for k in moments:
            kk = k.decode() if isinstance(k, (bytes, bytearray)) else str(k)
            if kk.strip().upper() == "VEL":
                key = k
                break
        if key is None:
            continue
        mhdr, vals = moments[key]
        a = getattr(hdr, "az_angle", None)
        if a is None:
            continue
        az.append(float(a))
        v = np.asarray(vals, dtype=np.float32)
        rows.append(v)
        max_gates = max(max_gates, len(v))
        if first_km is None:
            fg = float(getattr(mhdr, "first_gate", 0.0))
            gw = float(getattr(mhdr, "gate_width", 0.25))
            first_km = fg if fg < 100 else fg / 1000.0
            gate_km = gw if gw < 100 else gw / 1000.0
        if elev is None:
            e = getattr(hdr, "el_angle", None)
            if e is not None:
                elev = float(e)
        if nyq is None:
            rc = ray[3] if isinstance(ray, tuple) and len(ray) > 3 else getattr(ray, "radial_consts", None)
            n = getattr(rc, "nyq_vel", None) if rc is not None else None
            if n:
                nyq = float(n)

    if len(az) < 60 or max_gates == 0:
        return None
    vel = np.full((len(rows), max_gates), np.nan, dtype=np.float32)
    for i, row in enumerate(rows):
        vel[i, : len(row)] = row
    return (np.asarray(az, dtype=np.float32), vel,
            first_km or 0.0, gate_km or 0.25, elev or 0.0, nyq or 27.0)


def _gate_to_gate_segments(az, vel, first_km, gate_km, nyq):
    """Vectorized gate-to-gate shear segments between adjacent azimuths.
    Returns arrays (az_mid_deg, range_km, delta_v) for cyclonic couplets."""
    order = np.argsort(az)
    az_s = az[order]
    vel_s = vel[order]

    az_next = np.roll(az_s, -1)
    gap = (az_next - az_s) % 360.0
    pair_ok = gap < MAX_AZ_GAP_DEG  # adjacent radials only

    v1 = vel_s                     # lower azimuth
    v2 = np.roll(vel_s, -1, axis=0)  # adjacent higher azimuth

    dv = v2 - v1
    # Nyquist unfolding: a fold makes a huge jump of the wrong sign
    if nyq and nyq > 5:
        two_ny = 2.0 * nyq
        folded = np.abs(dv) > (1.6 * nyq)
        dv = np.where(folded, dv - np.sign(dv) * two_ny, dv)

    # Cyclonic gate-to-gate couplet (NH): velocity increases with azimuth
    # across the pair. Per Trapp et al. (1999) the TVS is defined by the
    # gate-to-gate delta-V itself — a vortex translating with its parent
    # storm does NOT need a sign change, so instead of absolute in/outbound
    # we require STORM-RELATIVE symmetry: both sides must deviate from the
    # local mean flow (range-smoothed) by a meaningful share of delta-V.
    # A vortex is two-sided; gust-front kinks and isolated noise spikes are
    # one-sided and fail. Speckled turbine clutter mostly fails too, and the
    # stationarity filter below removes what remains.
    v1_smooth = _nan_box_smooth(v1)
    v2_smooth = _nan_box_smooth(v2)
    local_mean = 0.5 * (v1_smooth + v2_smooth)
    valid = (
        pair_ok[:, None]
        & np.isfinite(v1) & np.isfinite(v2) & np.isfinite(local_mean)
        & (dv >= SEGMENT_DV)
        & ((local_mean - v1) >= 0.35 * dv)
        & ((v2 - local_mean) >= 0.35 * dv)
    )

    # Despeckle: both sides must be range-continuous (neighbor gate within
    # 15 m/s) so single-gate noise can't form a couplet.
    cont1 = np.zeros_like(valid)
    cont2 = np.zeros_like(valid)
    d1 = np.abs(np.diff(v1, axis=1))
    d2 = np.abs(np.diff(v2, axis=1))
    ok1 = d1 < 15.0
    ok2 = d2 < 15.0
    cont1[:, :-1] |= ok1
    cont1[:, 1:] |= ok1
    cont2[:, :-1] |= ok2
    cont2[:, 1:] |= ok2
    valid &= cont1 & cont2

    if not np.any(valid):
        return (np.empty(0), np.empty(0), np.empty(0))

    ri, gi = np.nonzero(valid)
    rng = first_km + gi.astype(np.float64) * gate_km
    in_range = (rng >= MIN_RANGE_KM) & (rng <= MAX_RANGE_KM)
    ri, gi, rng = ri[in_range], gi[in_range], rng[in_range]
    if len(ri) == 0:
        return (np.empty(0), np.empty(0), np.empty(0))

    az_mid = (az_s[ri] + (gap[ri] / 2.0)) % 360.0
    return az_mid, rng, dv[ri, gi].astype(np.float64)


def _cluster_2d(az_mid, rng, dv):
    """Group shear segments into 2D features (per elevation)."""
    feats = []
    if len(az_mid) == 0:
        return feats
    order = np.argsort(-dv)  # strongest first
    used = np.zeros(len(az_mid), dtype=bool)
    for idx in order:
        if used[idx]:
            continue
        d_az = np.abs(((az_mid - az_mid[idx]) + 180) % 360 - 180)
        # azimuthal tolerance widens with the arc the cluster spans
        members = (~used) & (d_az <= CLUSTER_AZ_DEG) & (np.abs(rng - rng[idx]) <= CLUSTER_RANGE_KM)
        n = int(np.count_nonzero(members))
        if n >= MIN_SEGMENTS_2D and dv[idx] >= FEATURE_DV:
            w = dv[members]
            feats.append({
                "az": float(np.average(az_mid[members], weights=w)),
                "rangeKm": float(np.average(rng[members], weights=w)),
                "deltaV": float(dv[idx]),
                "segments": n,
            })
        used |= members
    return feats


def _polar_to_lonlat(site, az_deg, range_km):
    az = math.radians(az_deg)
    lat0, lon0 = site["lat"], site["lon"]
    d_north = range_km * math.cos(az)
    d_east = range_km * math.sin(az)
    lat = lat0 + d_north / 110.574
    lon = lon0 + d_east / (111.32 * max(0.1, math.cos(math.radians(lat0))))
    return lon, lat


# --- stationary-clutter suppression -----------------------------------------
# A rotation signature that does not move is not a tornado: wind farms and
# residual ground clutter produce persistent gate-to-gate couplets at a fixed
# location. Track detection cells per site across volumes (keyed by scan
# time, so out-of-order timeline scans still work) and suppress any cell
# whose detections span more than STATIONARY_MINUTES.
STATIONARY_MINUTES = 45
STATIONARY_CELL_DEG = 0.03  # ~3 km
_stationary_history = {}    # site -> {cell: [min_ts, max_ts]}


def _stationary_check(site_id, ts, lon, lat):
    """Record this detection; return True if the cell has been producing
    detections for longer than STATIONARY_MINUTES (=> suppress)."""
    if ts is None:
        return False
    hist = _stationary_history.setdefault(site_id, {})
    cell = (round(lon / STATIONARY_CELL_DEG), round(lat / STATIONARY_CELL_DEG))
    entry = hist.get(cell)
    if entry is None:
        hist[cell] = [ts, ts]
        return False
    if ts < entry[0]:
        entry[0] = ts
    if ts > entry[1]:
        entry[1] = ts
    if len(hist) > 4000:
        hist.clear()
    return (entry[1] - entry[0]).total_seconds() > STATIONARY_MINUTES * 60


def detect_tvs(l2file, site_coords, site_id=None, volume_time=None):
    """Run TDA-lite over a (possibly partial) Level2File.
    Returns a list of detections sorted strongest-first."""
    # --- per-tilt 2D features ---
    tilt_feats = []  # (elev_deg, feats)
    seen_elevs = set()
    for sweep in l2file.sweeps[: MAX_TILTS * 2]:
        if not sweep:
            continue
        ext = _extract_vel_sweep(sweep)
        if ext is None:
            continue
        az, vel, first_km, gate_km, elev, nyq = ext
        ekey = round(elev, 1)
        if ekey in seen_elevs:
            continue
        seen_elevs.add(ekey)
        feats = _cluster_2d(*_gate_to_gate_segments(az, vel, first_km, gate_km, nyq))
        tilt_feats.append((elev, feats))
        if len(tilt_feats) >= MAX_TILTS:
            break

    if not tilt_feats:
        return []
    tilt_feats.sort(key=lambda t: t[0])

    # --- vertical association across tilts ---
    detections = []
    lowest_elev = tilt_feats[0][0]
    claimed = [set() for _ in tilt_feats]

    for t0, (elev0, feats0) in enumerate(tilt_feats):
        for f0i, f0 in enumerate(feats0):
            if f0i in claimed[t0]:
                continue
            column = [(t0, f0i, elev0, f0)]
            x0, y0 = f0["rangeKm"] * math.sin(math.radians(f0["az"])), \
                     f0["rangeKm"] * math.cos(math.radians(f0["az"]))
            for t1 in range(t0 + 1, len(tilt_feats)):
                elev1, feats1 = tilt_feats[t1]
                best = None
                for f1i, f1 in enumerate(feats1):
                    if f1i in claimed[t1]:
                        continue
                    x1 = f1["rangeKm"] * math.sin(math.radians(f1["az"]))
                    y1 = f1["rangeKm"] * math.cos(math.radians(f1["az"]))
                    dist = math.hypot(x1 - x0, y1 - y0)
                    if dist <= VERT_ASSOC_KM and (best is None or dist < best[0]):
                        best = (dist, f1i, elev1, f1)
                if best:
                    column.append((t1, best[1], best[2], best[3]))
                    x0 = best[3]["rangeKm"] * math.sin(math.radians(best[3]["az"]))
                    y0 = best[3]["rangeKm"] * math.cos(math.radians(best[3]["az"]))

            base = column[0]
            base_feat = base[3]
            max_dv = max(c[3]["deltaV"] for c in column)
            rng = base_feat["rangeKm"]

            # Operational thresholds (Operator's Guide via Trapp et al. 1999):
            # strong low-level couplet through the lowest two tilts, OR a
            # vertically deep feature (>= 2 associated tilts) above the
            # 2D-feature threshold.
            tvs_dv = TVS_DV_NEAR if rng < NEAR_RANGE_KM else TVS_DV_MID
            manual_rule = (
                len(column) >= 2
                and column[0][0] == 0
                and column[1][0] == 1
                and min(column[0][3]["deltaV"], column[1][3]["deltaV"]) >= tvs_dv
                and rng <= MID_RANGE_KM
            )
            depth_rule = (
                len(column) >= 3
                and rng <= MID_RANGE_KM
                and base_feat["deltaV"] >= DEPTH_RULE_BASE_DV
                and max_dv >= DEPTH_RULE_MAX_DV
            )
            if not (manual_rule or depth_rule):
                continue

            for t_i, f_i, _, _ in column:
                claimed[t_i].add(f_i)

            lon, lat = _polar_to_lonlat(site_coords, base_feat["az"], base_feat["rangeKm"])
            if site_id and _stationary_check(site_id, volume_time, lon, lat):
                continue
            low_dv = column[0][3]["deltaV"]
            if low_dv >= tvs_dv:
                strength = "extreme"
            elif low_dv >= 30:
                strength = "strong"
            else:
                strength = "weak"
            detections.append({
                "lon": lon,
                "lat": lat,
                "deltaV": round(low_dv, 1),
                "maxDeltaV": round(max_dv, 1),
                "rangeKm": round(rng, 1),
                "baseElevDeg": round(base[2], 2),
                "tiltCount": len(column),
                "class": "TVS" if base[0] == 0 else "ETVS",
                "strength": strength,
                "segments": base_feat["segments"],
            })

    detections.sort(key=lambda d: (0 if d["class"] == "TVS" else 1, -d["deltaV"]))
    return detections[:12]
