#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 1 ]] || { echo "Uso: bash deploy/kinghost/restore.sh backups/arquivo.sql.gz"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
[[ -f .env ]] || { echo ".env não encontrado em $ROOT" >&2; exit 1; }
[[ -f "$1" ]] || { echo "Backup não encontrado: $1" >&2; exit 1; }
gzip -t "$1"

read -r -p "Digite RESTAURAR para substituir o banco: " CONFIRM
[[ "$CONFIRM" == RESTAURAR ]] || exit 1

COMPOSE=(docker compose --env-file .env -f docker-compose.kinghost.yml)
gunzip -c "$1" | "${COMPOSE[@]}" exec -T database sh -lc \
  'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'
