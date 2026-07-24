#!/usr/bin/env bash
# Build for mahdiyar.me/tldrss and rsync to the server.
# Usage: bash scripts/deploy-server.sh
# Overrides: DEPLOY_HOST (user@host), DEPLOY_PATH, SITE_URL, BASE_PATH
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_HOST="${DEPLOY_HOST:-ubuntu@37.32.27.201}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/tldrss}"
export SITE_URL="${SITE_URL:-https://mahdiyar.me}"
export BASE_PATH="${BASE_PATH:-/tldrss/}"

echo "building for $SITE_URL$BASE_PATH ..."
npm run build

echo "syncing dist/ -> $DEPLOY_HOST:$DEPLOY_PATH ..."
rsync -az --delete dist/ "$DEPLOY_HOST:$DEPLOY_PATH/"

echo "deployed: $SITE_URL${BASE_PATH%/}/"
