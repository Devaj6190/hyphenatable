#!/bin/sh
# `bun run courier` from the repo root: the courier for the demo. Keeps the Mac awake while it runs
# (caffeinate -i, macOS only) and restarts it 3 s after it drops. Ctrl+C stops it for good.
cd "$(dirname "$0")/../../.." || exit 1

if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -i -w $$ &
else
  echo "caffeinate not found (not macOS): the machine may sleep while the courier runs"
fi

trap 'exit 0' INT TERM
while true; do
  bun apps/courier/src/index.ts
  code=$?
  # 0 is a clean stop (Ctrl+C or SIGTERM); 130 is Ctrl+C delivered to bun before it handled it.
  if [ "$code" -eq 0 ] || [ "$code" -eq 130 ]; then exit 0; fi
  echo "courier exited with code $code; texts are NOT being received. Restarting in 3 s (Ctrl+C to stop)."
  sleep 3
done
