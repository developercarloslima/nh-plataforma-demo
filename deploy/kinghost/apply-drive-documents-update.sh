#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "Aviso: o Retrato NH não utiliza mais Google Drive. Aplicando armazenamento no PostgreSQL por 40 dias."
exec bash "$ROOT_DIR/deploy/kinghost/apply-database-media-update.sh"
