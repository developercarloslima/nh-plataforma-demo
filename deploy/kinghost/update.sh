#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
bash deploy/kinghost/backup.sh || true
git pull --ff-only
docker compose --env-file .env -f docker-compose.kinghost.yml up -d --build --remove-orphans
docker image prune -f
echo "Atualização concluída."
