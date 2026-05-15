#!/usr/bin/env bash
# Genera floremoria-deploy.tar.gz (lean): .next, public, prisma, package*.json, next.config.ts
# Uso: dalla root repo → ./scripts/build-deploy-archive.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCHIVE_NAME="floremoria-deploy.tar.gz"
ARCHIVE_PATH="$ROOT/$ARCHIVE_NAME"

if [[ ! -d .next ]]; then
  echo "==> Cartella .next assente: eseguo npm run build..."
  npm run build
fi

for p in public prisma package.json package-lock.json next.config.ts; do
  if [[ ! -e "$p" ]]; then
    echo "ERRORE: manca $p" >&2
    exit 1
  fi
done

echo "==> Creo $ARCHIVE_PATH"
rm -f "$ARCHIVE_PATH"

tar -czf "$ARCHIVE_PATH" \
  .next \
  public \
  prisma \
  scripts/server-promote-super-admin.cjs \
  package.json \
  package-lock.json \
  next.config.ts

ls -lh "$ARCHIVE_PATH"
echo "OK: archivio pronto per SCP (senza node_modules). Sul server: deploy.sh esegue npm ci --omit=dev --ignore-scripts && npx prisma generate."
