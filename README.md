# RadarApp Setup Guide

## Quick start (macOS)

```sh
./start-mac.sh
```

This sets up the Python radar API (first run only), starts it on port 5100,
starts the web server on port 3000, and opens the app. Radar Level 2 and
Level 3 both load through the local radar API.

### The radar API (`radar-api/`)

The Windows-only `radar-api.exe` has been replaced by a cross-platform
Python service in `radar-api/` (same port 5100, same endpoints). It serves:

- **Level 3** products from `unidata-nexrad-level3` (radial-grid binary
  payloads — the client caches the mesh, so timeline frames are tiny)
- **Level 2** volumes from the `unidata-nexrad-level2` mirror (the
  `noaa-nexrad-level2` bucket no longer allows anonymous access)
- **Arc-Sync live Level 2** via SSE from `unidata-nexrad-level2-chunks` —
  partial sweeps stream in as the dish rotates (~10-20 s behind the radar)
- Batch timeline loading, archive listings, and IEM warning archives

Processed scans are cached in memory and on disk (`radar-api/temp/`,
auto-pruned to 2 GB / 24 h), so revisiting a frame is ~40 ms.
Electron (`main.js`) starts whichever backend fits the platform:
`bin/radar-api.exe` on Windows, `radar-api/.venv/bin/python` elsewhere.

## TVS detection (NSSL TDA)

The tornado-icon toggle runs a real Tornado Detection Algorithm server-side
(`radar-api/tda.py`), modeled on the NSSL TDA (Mitchell et al. 1998; Trapp
et al. 1999): gate-to-gate differential velocity across adjacent beams at
constant range, clustered into 2D features per elevation, vertically
associated across tilts, with the WSR-88D Operator's Guide thresholds
(ΔV ≥ 36 m/s at 56–93 km, ≥ 46 m/s inside 56 km, through the lowest two
tilts) plus a depth rule for elevated circulations. Practical guards:
Nyquist unfolding, storm-relative couplet symmetry (kills gust-front kinks
and one-sided noise), and a stationarity filter that suppresses wind-farm /
clutter couplets that don't move for 45+ minutes.

Detections poll every 45 s per completed Level 2 volume
(`/api/tvs/<site>`), draw 2D pulsing markers (click for ΔV/depth details),
and in 3D mode render Baron-style rotation gauges — collar color shows
strength (green weak / red strong / yellow extreme). TVS = base on the
lowest tilt; ETVS = elevated.

## 3D mode

The map is a full 3D scene (pitch up to 85°). Toggle **3D Tilt** in radar
settings to swing the camera into perspective — radar gates extrude along
the beam height, and a 3D radar tower appears at the selected site.
Rotate with right-click drag; pitch with Ctrl+drag.

3D elements can be placed on the map from anywhere in the app via
`window.Radar3D` (Baron Lynx-style overlays):

```js
// glTF/GLB model, sized to ~30 m, placed at lng/lat
await Radar3D.addModel("chase-truck", "models/truck.glb", {
  lng: -85.54, lat: 42.89, scaleMeters: 30, rotationDeg: 45,
});

// Built-in stylized WSR-88D tower
Radar3D.addRadarTower({ lng: -85.5447, lat: 42.8939 });

// Any three.js object (units = meters, Y-up)
const THREE = Radar3D.THREE;
const box = new THREE.Mesh(
  new THREE.BoxGeometry(500, 1000, 500),
  new THREE.MeshStandardMaterial({ color: 0xff3300 }),
);
Radar3D.addMesh("tornado-box", box, { lng: -85.2, lat: 42.5 });

Radar3D.move("chase-truck", { lng: -85.5, lat: 42.9 });
Radar3D.remove("chase-truck");
```

three.js is vendored in `js/vendor/three/` and loaded as an ES module via
an import map in `index.html`; the scene lives in `js/three-layer.js` as a
MapLibre custom layer with shared depth (`renderingMode: "3d"`), so models
sort correctly against the extruded radar.

### Spinning TVS vortices

The tornado icon checkbox (radar settings) enables TVS detection on
**velocity products** (VEL / N0G etc.). Detections are clustered, capped at
ten, and filtered within 12 km of the dish (ground clutter). Each detection
gets a 2D pulsing marker — and in 3D Tilt mode, an animated spinning
tornado funnel (striped rotating core, translucent shell, dust ring) whose
size scales with the detected shear strength. Programmatic use:
`Radar3D.addVortex("id", { lng, lat, strength })`.

### 3D surface fronts

The wind icon checkbox shows the current WPC surface analysis as 3D front
walls while in 3D Tilt mode: blue cold-front walls with triangle pips, red
warm fronts with domes, alternating stationary segments, purple occluded
fronts, dashed orange troughs, plus floating H/L pressure-center markers.
Data comes from the WPC **CODSUS** coded bulletin via `/api/fronts` on the
radar API (cached 10 min, auto-refreshed). Heights are display-exaggerated
so fronts read like a broadcast graphic at synoptic zoom.

---

## Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)
- **Python** (for backend scripts, optional)

---

## 1. Clone or Download the Project

Place all files in a directory, e.g., `RadarApp`.

---

## 2. Install Node.js Dependencies

Open a terminal in the project directory and run:

```sh
npm install
```

This will install all required packages listed in `package.json`, including:

- `nexrad-level-3-data`
- `hls.js` (HLS `.m3u8` playback)
- `dashjs` (MPEG-DASH `.mpd` playback)
- `ffmpeg-static` (RTSP snapshot fallback via `/api/camera/snapshot`)

---

## 3. Start the Web Server

You can use the included Express server to serve the app:

```sh
node server.js
```

The app will be available at [http://localhost:3000](http://localhost:3000).

---

## 4. Using the App

- Open your browser and go to [http://localhost:3000](http://localhost:3000).
- The main interface will load, displaying the radar map and controls.

---

## 5. Data Files

- **Radar Data:** The app fetches NEXRAD radar data from AWS S3.
- **Counties Data:** County outlines are loaded from `counties.geojson` (included in the project).
- **Camera Data:** `/api/cameras` merges local `cameras/` data with `maps-data` from GitHub (`anony121221/maps-data`).

---

## 6. Python Notes (Optional)

The runtime app is Node.js-based. A `requirements.txt` file is included for environments that expect it, but Python packages are not required for core app features.

---

## 7. Troubleshooting

- **Port in use?** Change the `PORT` variable in `server.js`.
- **Missing counties?** Ensure `counties.geojson` is present in the project root.
- **Radar data not loading?** Check your internet connection and AWS S3 access.

---

## 8. Customization

- Modify `app.js` for UI and feature changes.
- Update `index.html` for layout and style.
- Add new radar products or features as needed.

---

## 9. Useful Scripts

- `server.js`: Starts the Express web server.
- `app.js`: Main frontend logic.
- `app.py`: Python backend (optional).

---

## 10. License

This project includes code from MetPy Developers under the BSD 3-Clause License.

---

## 11. Support

For questions or issues, open an issue or contact the maintainer.

---

Enjoy exploring RadarApp!
