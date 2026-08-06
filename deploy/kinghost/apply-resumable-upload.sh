#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Arquivo .env não encontrado em $ROOT_DIR" >&2
  exit 1
fi

COMPOSE=(docker compose --env-file .env -f docker-compose.kinghost.yml)

"${COMPOSE[@]}" config >/dev/null
"${COMPOSE[@]}" up -d --build --force-recreate backend web

sleep 15
"${COMPOSE[@]}" ps

echo
echo "Últimas mensagens do backend:"
"${COMPOSE[@]}" logs --tail=80 backend

echo
echo "Atualização aplicada. O envio de vistoria agora é feito em partes retomáveis."
