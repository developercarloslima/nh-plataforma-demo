#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
[[ -f .env ]] || { echo ".env não encontrado em $ROOT" >&2; exit 1; }

mkdir -p backups
FILE="backups/nh-plataforma-$(date +%Y%m%d-%H%M%S).sql.gz"
COMPOSE=(docker compose --env-file .env -f docker-compose.kinghost.yml)

if "${COMPOSE[@]}" exec -T database sh -lc \
  'exec pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "$FILE" \
  && gzip -t "$FILE"; then
  find backups -type f -name '*.sql.gz' -mtime +14 -delete
  echo "Backup criado e validado: $FILE"
else
  rm -f "$FILE"
  echo "Falha ao criar o backup do PostgreSQL." >&2
  exit 1
fi
