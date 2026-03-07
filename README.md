# RadarApp Setup Guide


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
