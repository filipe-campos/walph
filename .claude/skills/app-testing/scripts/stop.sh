#!/usr/bin/env bash
# Stops the Walph test instance started by launch.sh.
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPTS/../../../.." && pwd)"

pkill -f "electron-vite dev" 2>/dev/null || true
pkill -f "$REPO/node_modules/electron/dist" 2>/dev/null || true
echo "Walph stopped."
