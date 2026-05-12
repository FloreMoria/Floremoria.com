#!/usr/bin/env bash
# Deploy incrementale: trasferisce SOLO i file modificati via rsync
# e poi esegue build/restart sul server.
#
# Uso:
#   export DEPLOY_SSH_USER="root"
#   export DEPLOY_HOST="94.177.198.140"
#   export DEPLOY_PATH="/var/www/floremoria"
#   ./deploy-incremental.sh
#
# Opzioni:
#   DRY_RUN=1 ./deploy-incremental.sh   # mostra cosa verrebbe sincronizzato

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_SSH_USER="${DEPLOY_SSH_USER:-root}"
DEPLOY_HOST="${DEPLOY_HOST:-94.177.198.140}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/floremoria}"
DRY_RUN="${DRY_RUN:-0}"

RSYNC_OPTS=(
  -az
  --itemize-changes
  --exclude ".git/"
  --exclude ".github/"
  --exclude ".next/"
  --exclude "node_modules/"
  --exclude ".env"
  --exclude ".env.*"
  --exclude "floremoria-deploy.tar.gz"
  --exclude "coverage/"
  --exclude ".cursor/"
  --exclude ".vscode/"
  --exclude "*.log"
)

if [[ "$DRY_RUN" == "1" ]]; then
  RSYNC_OPTS+=(--dry-run)
  echo "==> DRY RUN abilitato: nessuna modifica reale."
fi

echo "==> Sync incrementale verso ${DEPLOY_SSH_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
RSYNC_OUTPUT="$(rsync "${RSYNC_OPTS[@]}" "$ROOT/" "${DEPLOY_SSH_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/")"
echo "$RSYNC_OUTPUT"

if [[ "$DRY_RUN" == "1" ]]; then
  exit 0
fi

echo "==> Build e restart remoto"
ssh "${DEPLOY_SSH_USER}@${DEPLOY_HOST}" bash -s <<EOF
set -euo pipefail
cd "${DEPLOY_PATH}"

echo "[remote] install dipendenze complete (incluse dev per build Next/Tailwind): npm ci..."
npm ci

# Prisma client aggiornato ad ogni deploy (rapido, evita mismatch schema/client)
npx --yes prisma@6.19.2 generate
npm run build
pm2 restart floremoria --update-env
pm2 save >/dev/null 2>&1 || true
echo "[remote] deploy incrementale completato"
EOF

echo "==> OK: deploy incrementale finito."
