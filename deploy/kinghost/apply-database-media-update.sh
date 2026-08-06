#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

[[ -f .env ]] || { echo "Arquivo .env não encontrado em $ROOT_DIR" >&2; exit 1; }
COMPOSE=(docker compose --env-file .env -f docker-compose.kinghost.yml)

if grep -q '^INSPECTION_RETENTION_DAYS=' .env; then
  sed -i 's/^INSPECTION_RETENTION_DAYS=.*/INSPECTION_RETENTION_DAYS=40/' .env
else
  printf '\nINSPECTION_RETENTION_DAYS=40\n' >> .env
fi
chmod 600 .env

"${COMPOSE[@]}" config >/dev/null
"${COMPOSE[@]}" up -d --build --force-recreate backend web
sleep 20
"${COMPOSE[@]}" ps

echo
echo "Últimas mensagens do backend:"
"${COMPOSE[@]}" logs --tail=180 backend

echo
echo "Atualização aplicada. Fotos, vídeo, documentos, assinatura e relatório ficam no PostgreSQL por 40 dias."
