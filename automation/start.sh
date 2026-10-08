#!/bin/sh
set -eu
if [ "${NOVA_VIRTUAL_DESKTOP:-0}" = "1" ]; then
  Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
  sleep 1
  openbox &
  xterm -title 'Nova isolated desktop' &
fi
exec python /app/server.py
