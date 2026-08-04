#!/bin/sh
set -eu
escape_js() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
SGA_ESCAPED="$(escape_js "${SGA_URL:-https://sga.hinova.com.br/sga/sgav4_novohorizonte/v5/login.php}")"
TEAM_ESCAPED="$(escape_js "${TEAM_WHATSAPP_NUMBER:-}")"
cat > /usr/share/nginx/html/shared/config.js <<CONFIG
window.NH_CONFIG = {
  sgaUrl: "${SGA_ESCAPED}",
  teamWhatsapp: "${TEAM_ESCAPED}"
};
CONFIG
