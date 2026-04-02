#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/cut2kit-stable.pid"
LOG_FILE="$RUN_DIR/cut2kit-stable.log"
PORT=3774

mkdir -p "$RUN_DIR"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE")"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID"
    wait "$OLD_PID" 2>/dev/null || true
  fi
fi

LISTENER_PIDS="$(lsof -tiTCP:$PORT -sTCP:LISTEN || true)"
if [[ -n "$LISTENER_PIDS" ]]; then
  kill $LISTENER_PIDS 2>/dev/null || true
  sleep 1
fi

cd "$ROOT_DIR"
cd "$ROOT_DIR/apps/server"
setsid -f bash -lc "echo \$\$ > '$PID_FILE'; cd '$ROOT_DIR/apps/server'; exec env T3CODE_BASE_PATH=/cut2kit T3CODE_HOST=127.0.0.1 T3CODE_PORT=$PORT T3CODE_NO_BROWSER=1 node dist/bin.mjs >>'$LOG_FILE' 2>&1"
sleep 1
NEW_PID="$(cat "$PID_FILE")"
echo "cut2kit stable server started with pid $NEW_PID"
