#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
set -a; source .env; set +a
mkdir -p backups
FILE="backups/nh-plataforma-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose --env-file .env -f docker-compose.kinghost.yml exec -T database pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$FILE"
find backups -type f -name '*.sql.gz' -mtime +14 -delete
echo "Backup criado: $FILE"
