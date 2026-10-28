#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu server (EC2 t3.medium, 4 GB): installs Docker, adds swap
# for the Rust builds, writes .env with a fresh origin secret, then builds and starts Zonar.
#
#   git clone https://github.com/Akhil-2310/zonar.git && cd zonar && sudo bash deploy/setup.sh
#
# Safe to run again: it keeps an existing .env, wallets and match data.
set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR=$(pwd)
OWNER=${SUDO_USER:-ubuntu}

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash deploy/setup.sh" >&2
  exit 1
fi

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

say "Swap: 4 GB, so compiling zingo-cli and the builder doesn't run out of memory"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show

say "Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "$OWNER"
systemctl enable --now docker >/dev/null

say "Settings (.env)"
if [ ! -f .env ]; then
  cat > .env <<EOF
# Read by docker compose. Keep this file private.
COMPOSE_FILE=docker-compose.prod.yml
# CloudFront sends this as the X-Origin-Secret header (see DEPLOY.md, step 3).
ORIGIN_SECRET=$(openssl rand -hex 24)
EOF
  chmod 600 .env
fi
chown "$OWNER":"$OWNER" .env

say "Data folders"
# The container runs as uid 1000 (node), which is also the default ubuntu user.
mkdir -p .wallets .data
chown -R 1000:1000 .wallets .data
chmod 700 .wallets

say "Building and starting Zonar (the first build takes 15-20 minutes)"
docker compose build
docker compose up -d

say "Waiting for the game to answer"
SECRET=$(grep '^ORIGIN_SECRET=' .env | cut -d= -f2)
for _ in $(seq 1 60); do
  if curl -fsS -H "X-Origin-Secret: $SECRET" http://localhost/api/house >/tmp/zonar-house.json 2>/dev/null; then
    break
  fi
  sleep 5
done
cat /tmp/zonar-house.json 2>/dev/null || { echo "The game didn't answer. See: docker compose logs --tail 100" >&2; exit 1; }

IP=$(curl -fsS https://checkip.amazonaws.com 2>/dev/null || echo "<your static IP>")
cat <<EOF


Zonar is running.

  CloudFront (DEPLOY.md, step 3) must point at this server ($IP) over HTTP
  and send the custom origin header X-Origin-Secret with the ORIGIN_SECRET in .env.

  Useful commands (from $APP_DIR):
    docker compose logs -f --tail 100     # watch the server
    docker compose restart                # restart
    git pull && docker compose up -d --build   # update to the latest code

  Log out and back in once so your user can run docker without sudo.
EOF
