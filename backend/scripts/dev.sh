#!/bin/sh
set -eu

TS_PID=""

cleanup() {
  if [ -n "$TS_PID" ]; then
    kill "$TS_PID" 2>/dev/null || true
    wait "$TS_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

npm run build
npm run build:watch &
TS_PID=$!

docker compose up --build --watch
