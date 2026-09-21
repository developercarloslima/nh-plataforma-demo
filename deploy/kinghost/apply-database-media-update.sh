#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

[[ -f .env ]] || { echo "Arquivo .env não encontrado em $ROOT_DIR" >&2; exit 1; }
COMPOSE=(docker compose --env-file .env -f docker-compose.kinghost.yml)

set_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

set_env_value INSPECTION_RETENTION_DAYS 40
set_env_value INSPECTION_CLEANUP_CRON '0 15 * * * *'
set_env_value OPERATIONAL_RETENTION_DAYS 40
set_env_value OPERATIONAL_RETENTION_CLEANUP_CRON '0 40 * * * *'
chmod 600 .env

"${COMPOSE[@]}" config >/dev/null
"${COMPOSE[@]}" up -d --build --force-recreate backend web
sleep 20
"${COMPOSE[@]}" ps

echo
echo "Últimas mensagens do backend:"
"${COMPOSE[@]}" logs --tail=180 backend

echo
echo "Atualização aplicada. A presença de arquivo impede apenas o vencimento comercial da vistoria.
Cotação, vistoria e arquivos continuam sujeitos à exclusão operacional após 40 dias, independentemente do status."
