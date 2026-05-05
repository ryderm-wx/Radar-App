@echo off
REM === Frontend ===
start cmd /k "cd /d C:\Users\ryder\Desktop\Weather Coding Stuff\RadarApp && nodemon server.js"

REM === Backend ===
start cmd /k "C:\Users\ryder\miniconda3\Scripts\activate.bat radar_api_env && cd /d C:\Users\ryder\Desktop\Weather Coding Stuff\MSC Alert Graphics Gen\nexrad\Radar-Api && python app.py"

pause