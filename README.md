# RadarApp Setup Guide


---

## Prerequisites

- **Node.js** (v13 or higher recommended)
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

---

## 6. Python Backend (Also required)

Some advanced features use Python scripts (see `app.py` and related files):

- To use these, ensure you have Python 3 installed.
- Install required Python packages (if any) using:

  ```sh
  pip install -r requirements.txt
  ```

  _(You may need to create this file based on your needs.)_

- Run backend scripts as needed:

  ```sh
  python app.py
  ```

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
