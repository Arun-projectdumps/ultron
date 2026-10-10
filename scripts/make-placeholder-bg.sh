#!/bin/sh
# Rebuilds the placeholder wallpaper. Replace public/theme/nocturne/background.jpg with your own anytime.
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
python3 scripts/make-placeholder-bg.py > "$tmp/background.svg"
qlmanage -t -s 2560 -o "$tmp" "$tmp/background.svg" >/dev/null 2>&1
sips -s format jpeg -s formatOptions 80 "$tmp/background.svg.png" --out public/theme/nocturne/background.jpg >/dev/null
sips -c 1440 2560 public/theme/nocturne/background.jpg >/dev/null  # qlmanage pads to a square
rm -rf "$tmp"
sips -g pixelWidth -g pixelHeight public/theme/nocturne/background.jpg
