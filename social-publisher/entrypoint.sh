#!/bin/sh
set -eu

mkdir -p /data/browser-profiles /data/failures /data/tmp
rm -f /tmp/.X99-lock
Xvfb :99 -screen 0 1440x1000x24 -nolisten tcp &

VNC_PASSWORD="${NOVNC_PASSWORD:-overweel3d}"
x11vnc -storepasswd "${VNC_PASSWORD}" /tmp/vnc.pass >/dev/null
x11vnc -display :99 -rfbauth /tmp/vnc.pass -forever -shared -localhost -rfbport 5900 >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/novnc.log 2>&1 &

exec uvicorn app.main:app --host 0.0.0.0 --port 8787
