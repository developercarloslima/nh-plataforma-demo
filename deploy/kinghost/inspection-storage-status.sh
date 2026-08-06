#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
[[ -f .env ]] || { echo ".env não encontrado." >&2; exit 1; }
set -a; source .env; set +a
COMPOSE=(docker compose --env-file .env -f docker-compose.kinghost.yml)
"${COMPOSE[@]}" exec -T database psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
  COUNT(*) FILTER (WHERE a.storage_kind = 'DATABASE' AND a.purged_at IS NULL AND a.expires_at > now()) AS arquivos_disponiveis,
  COALESCE(pg_size_pretty(SUM(octet_length(c.file_data)) FILTER (WHERE a.purged_at IS NULL)), '0 bytes') AS tamanho_arquivos,
  MIN(a.expires_at) FILTER (WHERE a.purged_at IS NULL AND a.expires_at > now()) AS proxima_exclusao
FROM inspection_assets a
LEFT JOIN inspection_asset_contents c ON c.asset_id = a.id;
SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho_total_banco;
"
