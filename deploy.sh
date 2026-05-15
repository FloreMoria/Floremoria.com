#!/usr/bin/env bash
# Carica floremoria-deploy.tar.gz sul VPS via SCP ed estrae in DEPLOY_PATH.
# Prerequisito: chiave SSH configurata per l'utente indicato.
#
# Esempio:
#   export DEPLOY_SSH_USER="root"
#   export DEPLOY_HOST="94.177.198.140"
#   export DEPLOY_PATH="/var/www/floremoria"
#   ./deploy.sh
#
# Opzionale: percorso archivio locale
#   ./deploy.sh /percorso/custom/floremoria-deploy.tar.gz

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ARCHIVE_LOCAL="${1:-$ROOT/floremoria-deploy.tar.gz}"

DEPLOY_SSH_USER="${DEPLOY_SSH_USER:-root}"
DEPLOY_HOST="${DEPLOY_HOST:-94.177.198.140}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/floremoria}"
REMOTE_TMP="/tmp/floremoria-deploy-$$.tar.gz"

if [[ ! -f "$ARCHIVE_LOCAL" ]]; then
  echo "ERRORE: archivio non trovato: $ARCHIVE_LOCAL" >&2
  echo "Esegui prima: ./scripts/build-deploy-archive.sh" >&2
  exit 1
fi

echo "==> SCP → ${DEPLOY_SSH_USER}@${DEPLOY_HOST}:${REMOTE_TMP}"
scp "$ARCHIVE_LOCAL" "${DEPLOY_SSH_USER}@${DEPLOY_HOST}:${REMOTE_TMP}"

echo "==> Estrazione in ${DEPLOY_PATH} + npm ci + prisma generate (sul server)"
ssh "${DEPLOY_SSH_USER}@${DEPLOY_HOST}" bash -s <<EOF
set -euo pipefail
mkdir -p "${DEPLOY_PATH}"
cd "${DEPLOY_PATH}"
tar -xzf "${REMOTE_TMP}"
rm -f "${REMOTE_TMP}"
# --ignore-scripts: evita postinstall "prisma generate" (prisma CLI è devDependency, assente con --omit=dev)
npm ci --omit=dev --ignore-scripts
npx --yes prisma@6.19.2 generate
if [[ -f .env ]] || [[ -f .env.local ]]; then
  set -a
  [[ -f .env ]] && source .env
  [[ -f .env.local ]] && source .env.local
  set +a
fi
if [[ -n "\${DATABASE_URL:-}" ]]; then
  echo "==> prisma migrate deploy (sul server, DB locale al VPS)"
  npx --yes prisma@6.19.2 migrate deploy
else
  echo "ATTENZIONE: DATABASE_URL assente sul server — salto migrate deploy."
fi
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart floremoria || pm2 start npm --name floremoria -- run start
  pm2 save || true
  echo "OK: app avviata/riavviata con PM2 (processo: floremoria)."
else
  echo "PM2 non trovato sul server: installa PM2 e avvia con:"
  echo "pm2 start npm --name floremoria -- run start"
fi
EOF

echo "==> Deploy file completato."
