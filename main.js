const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

let apiProcess = null;
let mainWindow = null;

function isDev() {
  return !app.isPackaged;
}

function getApiExePath() {
  if (isDev()) {
    return path.join(__dirname, "bin", "radar-api.exe");
  }
  return path.join(process.resourcesPath, "bin", "radar-api.exe");
}

function getApiCommand() {
  // Windows builds ship a compiled radar-api.exe; everywhere else run the
  // Python API from radar-api/ with its venv interpreter.
  const fs = require("fs");
  const exePath = getApiExePath();
  if (process.platform === "win32" && fs.existsSync(exePath)) {
    return { command: exePath, args: [], cwd: path.dirname(exePath) };
  }

  const apiDir = path.join(__dirname, "radar-api");
  const venvPython = path.join(
    apiDir,
    process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python",
  );
  const python = fs.existsSync(venvPython) ? venvPython : "python3";
  return { command: python, args: [path.join(apiDir, "app.py")], cwd: apiDir };
}

function waitForUrl(url, timeoutMs = 30000, intervalMs = 300) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });

      req.on("error", retry);

      function retry() {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${url}`));
          return;
        }
        setTimeout(tick, intervalMs);
      }
    };

    tick();
  });
}

function startFrontendServerInProcess() {
  // server.js already calls app.listen on port 3000
  require(path.join(__dirname, "server.js"));
}

function startApiExe() {
  const { command, args, cwd } = getApiCommand();

  apiProcess = spawn(command, args, {
    cwd,
    windowsHide: true,
    detached: false,
  });

  apiProcess.stdout.on("data", (data) => {
    console.log(`[API] ${data}`);
  });

  apiProcess.stderr.on("data", (data) => {
    console.error(`[API ERROR] ${data}`);
  });

  apiProcess.on("close", (code) => {
    console.log(`API process exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 950,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL("http://127.0.0.1:3000");
}

function stopChildProcesses() {
  if (apiProcess && !apiProcess.killed) {
    try {
      apiProcess.kill();
    } catch (e) {
      console.warn("Failed to kill API process:", e.message);
    }
  }
  apiProcess = null;
}

app.whenReady().then(async () => {
  try {
    startFrontendServerInProcess();
    startApiExe();

    await Promise.all([
      waitForUrl("http://127.0.0.1:3000", 30000),
      waitForUrl("http://127.0.0.1:5100", 45000),
    ]);

    createWindow();
  } catch (err) {
    dialog.showErrorBox("Startup Failed", String(err.message || err));
    stopChildProcesses();
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  stopChildProcesses();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
