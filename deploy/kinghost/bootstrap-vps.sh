#!/usr/bin/env bash
set -Eeuo pipefail
if [[ ${EUID} -ne 0 ]]; then echo "Execute: sudo bash deploy/kinghost/bootstrap-vps.sh"; exit 1; fi
apt-get update
apt-get install -y ca-certificates curl git unzip ufw
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
fi
systemctl enable --now docker
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != root ]]; then usermod -aG docker "$SUDO_USER"; fi
echo "Docker: $(docker --version)"
echo "Compose: $(docker compose version)"
echo "Bootstrap concluído. Saia e entre novamente no SSH se o usuário foi adicionado ao grupo docker."
