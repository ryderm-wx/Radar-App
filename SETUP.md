# RadarApp Setup Guide

This guide will help you get RadarApp running locally, both as a web application and as a desktop Electron app with an integrated backend.

---

## 1. Prerequisites

- **Node.js** (v14+ recommended)
- **npm** (comes with Node.js)
- **Python** (v3.8+ recommended, for backend)
- **pip** (for Python dependencies)

---

## 2. Install Dependencies

### JavaScript/Node.js

1. Open a terminal in the project root folder.
2. Run:
   ```sh
   npm install
   ```
   This installs all required Node.js packages (see `package.json`).

### Python

1. (Optional but recommended) Create a virtual environment:
   ```sh
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
2. Install required Python packages:
   ```sh
   pip install flask flask-cors requests
   ```
   Add any other dependencies as needed for your backend code.

---

## 3. Running as a Web App

### Start the Backend (Flask)

1. In the project root, run:
   ```sh
   python app.py
   ```
   This starts the Flask backend server.

### Start the Frontend (Node.js Static Server)

1. In a separate terminal, run:

   ```sh
   node server.js
   ```

   This serves the frontend files (HTML/JS/CSS) on [http://localhost:3000](http://localhost:3000).

2. Open your browser and go to [http://localhost:3000](http://localhost:3000).

---

## 4. Running as an Electron App

You can package RadarApp as a desktop app using [Electron](https://www.electronjs.org/). The Electron app will:

- Launch the backend (Flask) automatically
- Serve the frontend in a desktop window

### Steps

1. **Install Electron**

   ```sh
   npm install --save-dev electron
   ```

2. **Create `main.js` for Electron**
   Add a file `main.js` in your project root:

   ```js
   const { app, BrowserWindow } = require("electron");
   const { spawn } = require("child_process");
   let flaskProcess;

   function createWindow() {
     const win = new BrowserWindow({
       width: 1200,
       height: 800,
       webPreferences: { nodeIntegration: false },
     });
     win.loadURL("http://localhost:3000");
   }

   app.on("ready", () => {
     // Start Flask backend
     flaskProcess = spawn("python", ["app.py"], { cwd: __dirname });
     flaskProcess.stdout.on("data", (data) => console.log(`Flask: ${data}`));
     flaskProcess.stderr.on("data", (data) =>
       console.error(`Flask Error: ${data}`)
     );
     createWindow();
   });

   app.on("window-all-closed", () => {
     if (flaskProcess) flaskProcess.kill();
     app.quit();
   });
   ```

3. **Update `package.json` Scripts**
   Add this to your `package.json`:

   ```json
   "main": "main.js",
   "scripts": {
     "start": "electron ."
   }
   ```

4. **Run the Electron App**
   ```sh
   npm run start
   ```
   This will launch the backend and open the app in a desktop window.

---

## 5. Notes

- Make sure Python is in your system PATH for Electron to launch Flask.
- You may need to adjust CORS settings in Flask for local development.
- For production, consider packaging Python dependencies and using tools like [PyInstaller](https://www.pyinstaller.org/) or [electron-builder](https://www.electron.build/) for a seamless install.

---

## 6. Troubleshooting

- **Port conflicts**: Ensure no other app is using port 3000 (Node.js) or your Flask port.
- **Python errors**: Check that all required Python packages are installed.
- **Electron issues**: Make sure Electron is installed as a dev dependency.

---

## 7. File Overview

- `app.py`: Flask backend
- `server.js`: Node.js static file server
- `main.js`: Electron main process (for desktop app)
- `index.html`, `app.js`: Frontend files
- `counties.geojson`: County data for alerts

---

## 8. Useful Links

- [Electron Documentation](https://www.electronjs.org/docs)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [Node.js Documentation](https://nodejs.org/en/docs/)

---

Enjoy RadarApp!
