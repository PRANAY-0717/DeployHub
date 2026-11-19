#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu 22.04 VM (AWS EC2): Docker, Node 20, k3s (Kubernetes), pm2, project deps, .env.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

echo "==> Installing packages"
sudo apt-get update -y
sudo apt-get install -y docker.io git curl ca-certificates openssl
sudo usermod -aG docker "$USER"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2

echo "==> Installing k3s (lightweight Kubernetes)"
if ! command -v k3s >/dev/null; then curl -sfL https://get.k3s.io | sh -; fi
mkdir -p "$HOME/.kube"
sudo cp /etc/rancher/k3s/k3s.yaml "$HOME/.kube/config"
sudo chown "$USER" "$HOME/.kube/config"
chmod 600 "$HOME/.kube/config"

echo "==> Installing project dependencies"
cd "$ROOT_DIR/backend"
npm install --omit=dev --no-audit --no-fund
cd "$ROOT_DIR"
if [ -f package.json ]; then npm install --omit=dev --no-audit --no-fund || true; fi

echo "==> Preparing .env"
[ -f "$ROOT_DIR/backend/.env" ] || cp "$ROOT_DIR/backend/.env.example" "$ROOT_DIR/backend/.env"
setkv() { # setkv KEY VALUE (replace the line or append it in backend/.env)
  local target="$ROOT_DIR/backend/.env"
  if grep -q "^$1=" "$target"; then sed -i "s|^$1=.*|$1=$2|" "$target"; else echo "$1=$2" >> "$target"; fi
}
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)
[ -n "$IP" ] || IP=$(curl -s https://checkip.amazonaws.com | tr -d '[:space:]')
grep -qE '^SESSION_SECRET=(change-me.*|)$' "$ROOT_DIR/backend/.env" && setkv SESSION_SECRET "$(openssl rand -hex 32)"
grep -qE '^WEBHOOK_SECRET=(change-me.*|)$' "$ROOT_DIR/backend/.env" && setkv WEBHOOK_SECRET "$(openssl rand -hex 20)"
setkv BASE_URL "http://$IP:3000"
setkv LOCAL_HOST "$IP"
setkv CLUSTER_MODE "local"

# Also sync to root .env if running from root
cp "$ROOT_DIR/backend/.env" "$ROOT_DIR/.env" 2>/dev/null || true

cat <<MSG

Setup done. Public IP detected: $IP
Next:
  1. Edit backend/.env and fill GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, DOCKER_USER, DOCKER_PASS (and ALLOWED_GITHUB_USERS if desired)
  2. In your GitHub OAuth App set the callback URL to: http://$IP:3000/auth/callback
  3. Log out and back in (docker group), then run:  bash aws-kubernetes/aws/start.sh
MSG
