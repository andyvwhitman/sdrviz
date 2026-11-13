#!/usr/bin/env bash
# Headless-Chromium screenshot of one app URL.
#
#   scripts/shot.sh <url> <out.png> [1920|1440]
#
# The window is exactly stage size, so the stage renders 1:1. Output goes under build-screens/
# (gitignored scratch) unless you pass another path.
#
# Timing: the page opens a WebSocket and sets <html data-ready="1"> after the first snapshot.
# --virtual-time-budget works with the socket (verified), and it fast-forwards timers, so
# SHOT_BUDGET_MS=20000 shows the app 20 s after load (RECONNECTING / NO LINK frames) in under a second.
# Use ?freeze=1 so the sim clock does not move while the budget runs.
set -euo pipefail

url=${1:?usage: shot.sh <url> <out.png> [1920|1440]}
out=${2:?usage: shot.sh <url> <out.png> [1920|1440]}
size=${3:-1920}
case "$size" in
  1920) window=1920,1080 ;;
  1440) window=1440,900 ;;
  *) echo "size must be 1920 or 1440" >&2; exit 2 ;;
esac

chromium="/Applications/Chromium.app/Contents/MacOS/Chromium"
mkdir -p "$(dirname "$out")"
"$chromium" --headless=new --hide-scrollbars --window-size="$window" \
  --virtual-time-budget="${SHOT_BUDGET_MS:-4000}" --screenshot="$out" "$url" 2>/dev/null
echo "$out"
