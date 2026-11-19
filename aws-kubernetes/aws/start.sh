#!/usr/bin/env bash
# Runs preflight, then starts (or restarts) DeploySync under pm2 and enables start-on-boot.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR/backend"
npm run -s preflight
if pm2 describe deploysync >/dev/null 2>&1; then
  pm2 restart deploysync --update-env
else
  pm2 start server.js --name deploysync
fi
pm2 save
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null || true
echo
pm2 status deploysync
ENV_FILE="$ROOT_DIR/backend/.env"
if [ -f "$ENV_FILE" ]; then
  BASE_URL="$(grep '^BASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
  echo "Open: $BASE_URL   (health: $BASE_URL/healthz)"
fi
