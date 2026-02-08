# RadarApp Installation Guide

This guide will help you set up and run the RadarApp on Windows, macOS, or Linux.

---

## Prerequisites

- **Python 3.8+** (https://www.python.org/downloads/)
- **Node.js 16+** (https://nodejs.org/)
- **npm** (comes with Node.js)

---

## 1. Clone or Download the Repository

Download or clone the project to your computer.

```
git clone <your-repo-url>
cd RadarApp
```

---

## 2. Install Python Dependencies

Install required Python packages:

```
pip install -r requirements.txt
```

If you get a permissions error, try running your terminal as administrator (Windows) or use `sudo` (macOS/Linux):

```
sudo pip install -r requirements.txt
```

---

## 3. Install Node.js Dependencies

Install required Node.js packages:

```
npm install
```

---

## 4. Start the Backend (Flask)

In one terminal, start the Python backend:

```
python app.py
```

---

## 5. Start the Frontend (Express/Node.js)

In a new terminal, start the Node.js server:

```
node server.js
```

---

## 6. Open the App

Open your browser and go to:

```
http://localhost:3000
```

You should see the RadarApp interface.

---

## 7. (Optional) Troubleshooting

- If you see errors about missing packages, double-check you ran the install commands above.
- Make sure both the backend (Flask) and frontend (Node.js) servers are running.
- If you change code, restart the relevant server.

---

## 8. (Optional) Production/Deployment

For deployment or advanced packaging (e.g., .exe, .dmg), see the README or ask for further instructions.

---

**Enjoy using RadarApp!**
