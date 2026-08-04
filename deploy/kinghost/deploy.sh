#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
[[ -f .env ]] || { echo "Crie o .env: cp .env.kinghost.example .env"; exit 1; }
if grep -Eq 'TROQUE_|COLOQUE-O-LINK' .env; then echo "O .env ainda contém valores de exemplo."; exit 1; fi
docker compose --env-file .env -f docker-compose.kinghost.yml config >/dev/null
docker compose --env-file .env -f docker-compose.kinghost.yml up -d --build --remove-orphans
docker compose --env-file .env -f docker-compose.kinghost.yml ps
echo "Deploy iniciado. Logs: bash deploy/kinghost/logs.sh"
