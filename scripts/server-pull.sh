#!/usr/bin/env bash
# Runs ON the server (cron): pull the latest built site from the server-dist
# branch and sync it into the Caddy-served directory. Pull-based because the
# server cannot accept inbound SSH from GitHub Actions runners.
set -euo pipefail

REPO="${REPO:-https://github.com/smzerehpoush/TL-DRSS.git}"
CHECKOUT="${CHECKOUT:-/opt/tldrss/server-dist}"
DEST="${DEST:-/srv/tldrss}"

if [ ! -d "$CHECKOUT/.git" ]; then
  mkdir -p "$CHECKOUT"
  git clone -q --depth 1 -b server-dist "$REPO" "$CHECKOUT"
else
  git -C "$CHECKOUT" fetch -q --depth 1 origin server-dist
  git -C "$CHECKOUT" reset -q --hard origin/server-dist
fi

rsync -a --delete --exclude='.git' "$CHECKOUT"/ "$DEST"/
