#!/bin/zsh
# Starts the Radar App on macOS: radar API (port 5100) + web server (port 3000).
set -e
HERE="${0:A:h}"
cd "$HERE"

# Python radar API
if [[ ! -x radar-api/.venv/bin/python ]]; then
  echo "Setting up radar-api Python environment…"
  python3 -m venv radar-api/.venv
  radar-api/.venv/bin/pip install -q -r radar-api/requirements.txt
fi

# Reuse an already-running radar API; otherwise start one
API_PID=""
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:5100/health; then
  echo "Radar API already running on :5100 — reusing it."
else
  echo "Starting radar API on :5100…"
  radar-api/.venv/bin/python radar-api/app.py &
  API_PID=$!
fi

cleanup() { [[ -n "$API_PID" ]] && kill $API_PID 2>/dev/null; }
trap cleanup EXIT INT TERM

# Wait for the API to come up
for i in {1..40}; do
  curl -s -o /dev/null http://127.0.0.1:5100/health && break
  sleep 0.5
done

echo "Starting web server on :3000…"
( sleep 2 && open "http://localhost:3000" ) &
node server.js
