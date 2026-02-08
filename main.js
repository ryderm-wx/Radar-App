const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let flaskProcess = null;


function startFlask() {
  // Adjust python path and script as needed
  const pythonExe = 'python'; // or 'python3' if required
  const scriptPath = path.join(__dirname, 'app.py');
  flaskProcess = spawn(pythonExe, [scriptPath], {
    cwd: __dirname,
    shell: true,
    detached: false,
  });

  flaskProcess.stdout.on('data', (data) => {
    console.log(`[Flask] ${data}`);
  });
  flaskProcess.stderr.on('data', (data) => {
    console.error(`[Flask ERROR] ${data}`);
  });
  flaskProcess.on('close', (code) => {
    console.log(`Flask process exited with code ${code}`);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  // Point to Express server (frontend)
  win.loadURL('http://localhost:3000');
}

app.whenReady().then(() => {
  startFlask();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (flaskProcess) flaskProcess.kill();
    app.quit();
  }
});
