#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-/opt/nh-plataforma/nh-plataforma-demo-main}"
cd "$PROJECT_DIR"

COMPOSE=(docker compose --env-file .env -f docker-compose.kinghost.yml)

printf '\n=== Estado dos contêineres ===\n'
"${COMPOSE[@]}" ps database backend

printf '\n=== Verificação dos arquivos do Retrato NH no PostgreSQL ===\n'
"${COMPOSE[@]}" exec -T database sh -lc 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
\pset pager off

SELECT version, description, success, installed_on
  FROM flyway_schema_history
 WHERE version IN ('24', '25', '27')
 ORDER BY installed_rank;

SELECT status,
       count(*) AS arquivos,
       pg_size_pretty(coalesce(sum(total_size), 0)) AS tamanho_logico
  FROM inspection_asset_blobs
 GROUP BY status
 ORDER BY status;

SELECT count(*) AS partes_no_banco,
       pg_size_pretty(coalesce(sum(octet_length(chunk_data)), 0)) AS bytes_gravados
  FROM inspection_asset_blob_chunks;

SELECT count(*) AS conteudos_legados,
       pg_size_pretty(coalesce(sum(octet_length(file_data)), 0)) AS bytes_legados
  FROM inspection_asset_contents;

SELECT count(*) AS arquivos_confirmados_inconsistentes
  FROM inspection_asset_blobs blob
 WHERE blob.status = 'COMPLETE'
   AND (
       blob.asset_id IS NULL
       OR blob.total_chunks <> (
           SELECT count(*) FROM inspection_asset_blob_chunks chunk WHERE chunk.blob_id = blob.id
       )
       OR blob.total_size <> (
           SELECT coalesce(sum(chunk.chunk_size), 0)
             FROM inspection_asset_blob_chunks chunk
            WHERE chunk.blob_id = blob.id
       )
   );

SELECT count(*) AS metadados_ativos_sem_conteudo
  FROM inspection_assets asset
 WHERE asset.storage_kind = 'DATABASE'
   AND asset.purged_at IS NULL
   AND NOT EXISTS (
       SELECT 1
         FROM inspection_asset_blobs blob
        WHERE blob.asset_id = asset.id
          AND blob.status = 'COMPLETE'
   )
   AND NOT EXISTS (
       SELECT 1 FROM inspection_asset_contents legacy WHERE legacy.asset_id = asset.id
   );

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM inspection_asset_blobs blob
         WHERE blob.status = 'COMPLETE'
           AND (
               blob.asset_id IS NULL
               OR blob.total_chunks <> (
                   SELECT count(*) FROM inspection_asset_blob_chunks chunk WHERE chunk.blob_id = blob.id
               )
               OR blob.total_size <> (
                   SELECT coalesce(sum(chunk.chunk_size), 0)
                     FROM inspection_asset_blob_chunks chunk
                    WHERE chunk.blob_id = blob.id
               )
           )
    ) THEN
        RAISE EXCEPTION 'Existem arquivos marcados como COMPLETE com partes ausentes.';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM inspection_assets asset
         WHERE asset.storage_kind = 'DATABASE'
           AND asset.purged_at IS NULL
           AND NOT EXISTS (
               SELECT 1
                 FROM inspection_asset_blobs blob
                WHERE blob.asset_id = asset.id
                  AND blob.status = 'COMPLETE'
           )
           AND NOT EXISTS (
               SELECT 1 FROM inspection_asset_contents legacy WHERE legacy.asset_id = asset.id
           )
    ) THEN
        RAISE EXCEPTION 'Existem metadados ativos sem conteúdo binário confirmado no PostgreSQL.';
    END IF;
END
$$;

SELECT blob.completed_at,
       request.associate_name,
       request.plate,
       blob.asset_type,
       blob.file_name,
       pg_size_pretty(blob.total_size) AS tamanho
  FROM inspection_asset_blobs blob
  JOIN inspection_requests request ON request.id = blob.inspection_id
 WHERE blob.status = 'COMPLETE'
 ORDER BY blob.completed_at DESC
 LIMIT 20;
SQL

printf '\nOK: a estrutura e os arquivos confirmados no PostgreSQL passaram na validação.\n'
