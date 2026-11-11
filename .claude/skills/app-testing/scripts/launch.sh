#!/usr/bin/env bash
# Starts Walph in dev mode with debugging ports and (optionally) opens a folder.
# Usage: launch.sh [workspace-dir]
#   More workspaces in the same window: `node cdp.mjs add <dir>` (one tab + one view each). Without a dir, the previous
#   session is restored from <userData>/windows.json (only the active workspace gets a view; the rest are dormant tabs).
# Env: WALPH_USER_DATA_DIR=<dir> runs with an isolated --user-data-dir (settings, localStorage, keybindings).
#      WALPH_HIDDEN_WINDOWS=0 shows the windows (default 1: runs in the background, no window on screen, no Dock icon).
#      WALPH_LOCALE=en|es|pt-BR is the "system" language when workbench.language is "system" (default pt-BR).
set -euo pipefail

SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPTS/../../../.." && pwd)"
OUT="${WALPH_TEST_DIR:-${TMPDIR:-/tmp}/walph-test}"
CDP_PORT="${WALPH_CDP_PORT:-9333}"
INSPECT_PORT="${WALPH_INSPECT_PORT:-9334}"
mkdir -p "$OUT"

"$SCRIPTS/stop.sh" >/dev/null 2>&1 || true

# Windows are never shown by default (screenshots/CDP still work): testing doesn't steal the user's focus.
export WALPH_HIDDEN_WINDOWS="${WALPH_HIDDEN_WINDOWS:-1}"
export WALPH_LOCALE="${WALPH_LOCALE:-pt-BR}"

# The folder goes through argv (`electron-vite dev -- <folder>`); main assigns it to the first window's workspace (`workspace:current`).
FOLDER=()
if [ -n "${1:-}" ]; then FOLDER=("$(cd "$1" && pwd)"); fi

USERDATA=()
if [ -n "${WALPH_USER_DATA_DIR:-}" ]; then
  mkdir -p "$WALPH_USER_DATA_DIR"
  USERDATA=("--user-data-dir=$(cd "$WALPH_USER_DATA_DIR" && pwd)")
fi

cd "$REPO"
# ELECTRON_RUN_AS_NODE inherited from VS Code/Claude Code would make Electron run as plain Node.
env -u ELECTRON_RUN_AS_NODE nohup pnpm exec electron-vite dev -- ${FOLDER[@]+"${FOLDER[@]}"} \
  ${USERDATA[@]+"${USERDATA[@]}"} \
  --remote-debugging-port="$CDP_PORT" --inspect="$INSPECT_PORT" >"$OUT/dev.log" 2>&1 &

for _ in $(seq 1 120); do
  if curl -s "localhost:$CDP_PORT/json" 2>/dev/null | grep -q '"type": "page"'; then break; fi
  sleep 0.5
done

if ! curl -s "localhost:$CDP_PORT/json" 2>/dev/null | grep -q '"type": "page"'; then
  echo "The app did not start. Last lines of $OUT/dev.log:" >&2
  grep -v '^\s*at ' "$OUT/dev.log" | tail -20 >&2
  exit 1
fi

node "$SCRIPTS/cdp.mjs" wait "document.querySelector('.app') !== null" 15000 >/dev/null

if [ -n "${1:-}" ]; then
  if ! node "$SCRIPTS/cdp.mjs" wait "document.querySelectorAll('.tree .tree-row').length > 0" 15000 >/dev/null; then
    echo "The explorer did not load $1. Last lines of $OUT/dev.log:" >&2
    grep -v '^\s*at ' "$OUT/dev.log" | tail -20 >&2
    exit 1
  fi
  echo "workspace opened: ${FOLDER[0]}"
fi

echo "Walph running (CDP :$CDP_PORT, main :$INSPECT_PORT). Log: $OUT/dev.log"
