#!/usr/bin/env bash
# Deploys this working tree to a VM set up as in README.md (Running sweeps on a VM): copies the code
# (not node_modules, builds or .env files), installs, builds and restarts the planet-sweeps service.
# Usage: scripts/deploy-vm.sh ubuntu@<host> [ssh key]
set -euo pipefail
host=${1:?usage: scripts/deploy-vm.sh ubuntu@<host> [ssh key]}
key=${2:-$HOME/.ssh/oracle.key}
cd "$(dirname "$0")/.."
rsync -az --delete --exclude node_modules --exclude .next --exclude .vercel --exclude '.env*' --exclude '*.png' -e "ssh -i $key" ./ "$host:/srv/planet-sweeps/"
ssh -i "$key" "$host" 'cd /srv/planet-sweeps && npm ci --no-audit --no-fund --loglevel=error && npm run build >/tmp/build.log 2>&1 || { tail -30 /tmp/build.log; exit 1; }; sudo systemctl restart planet-sweeps && sleep 5 && systemctl is-active planet-sweeps'
