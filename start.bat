@echo off
REM Start nodemon server in the current project directory
cd /d "C:\Users\ryder\Desktop\Weather Coding Stuff\MSCLiveStream"
start "Node Server" cmd /k "nodemon server.js"

REM Initialize miniconda3, activate the environment, and run the Python app
start "Radar API" cmd /k "call C:\Users\ryder\miniconda3\Scripts\activate.bat && conda activate radar_api_env && python "C:\Users\ryder\Desktop\Weather Coding Stuff\MSCRADARREPO\MSC-Radar-Repo\app.py""
