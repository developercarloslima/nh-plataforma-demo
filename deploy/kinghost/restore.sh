#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# -eq 1 ]] || { echo "Uso: bash deploy/kinghost/restore.sh backups/arquivo.sql.gz"; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
set -a; source .env; set +a
read -r -p "Digite RESTAURAR para substituir o banco: " CONFIRM
[[ "$CONFIRM" == RESTAURAR ]] || exit 1
gunzip -c "$1" | docker compose --env-file .env -f docker-compose.kinghost.yml exec -T database psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"
