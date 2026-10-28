#!/usr/bin/env bash
# Moves an existing house wallet onto the server, so the same funded house keeps paying prizes.
#
#   On your computer:  tar czf house.tgz .wallets/house   (macOS: add --no-xattrs)
#   Upload house.tgz to the server's home folder, then:
#   cd ~/zonar && sudo bash deploy/import-house.sh ~/house.tgz
#
# Any house the server created on its own is kept as .wallets/house.replaced-<time>.
# Afterwards, stop running the game on your computer: two copies of one wallet will collide.
set -euo pipefail

cd "$(dirname "$0")/.."
ARCHIVE=${1:-}
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: sudo bash deploy/import-house.sh path/to/house.tgz" >&2
  exit 1
fi
# List first: with pipefail, grep -q closing the pipe early would fail tar's side of it.
LISTING=$(tar tzf "$ARCHIVE" 2>/dev/null)
if ! grep -q '^\.wallets/house/' <<<"$LISTING"; then
  echo "$ARCHIVE doesn't contain .wallets/house/ (make it with: tar czf house.tgz .wallets/house)" >&2
  exit 1
fi

docker compose down
if [ -d .wallets/house ]; then
  mv .wallets/house ".wallets/house.replaced-$(date +%Y%m%d-%H%M%S)"
fi
tar xzf "$ARCHIVE" .wallets/house 2>/dev/null
chown -R 1000:1000 .wallets
docker compose up -d
echo "House wallet imported. It syncs for a minute or two; then its balance shows on the landing page."
