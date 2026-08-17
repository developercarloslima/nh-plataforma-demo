#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
[[ -f .env ]] || { echo ".env não encontrado em $ROOT" >&2; exit 1; }

COMPOSE=(docker compose --env-file .env -f docker-compose.kinghost.yml)

"${COMPOSE[@]}" exec -T database sh -lc 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off' <<'SQL'
SELECT
    a.id,
    r.associate_name,
    r.plate,
    a.file_name,
    ROUND(a.file_size / 1024.0 / 1024.0, 1) AS size_mb,
    a.stored_at,
    a.expires_at,
    a.purged_at,
    (
      EXISTS (
        SELECT 1
          FROM inspection_asset_blobs b
         WHERE b.asset_id = a.id
           AND b.status = 'COMPLETE'
      )
      OR EXISTS (
        SELECT 1
          FROM inspection_asset_contents c
         WHERE c.asset_id = a.id
      )
    ) AS has_binary
FROM inspection_assets a
JOIN inspection_requests r ON r.id = a.inspection_id
WHERE a.asset_type = 'VIDEO'
ORDER BY a.stored_at DESC NULLS LAST;
SQL
