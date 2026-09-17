#!/usr/bin/env bash
# Verifica dump Neon → restore locale PostgreSQL 17 e confronta contatori.
# Uso: DATABASE_URL=... ./scripts/verify-neon-backup-restore.sh
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/opt/libpq/bin:${PATH:-}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a; source <(grep -E '^DATABASE_URL=' .env | sed 's/^/export /'); set +a
  fi
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL mancante" >&2
  exit 2
fi

SQL=$(cat <<'SQL'
SELECT
  (SELECT COUNT(*) FROM "Order" WHERE is_test = false AND "deletedAt" IS NULL AND status::text NOT IN ('CANCELLED','REFUNDED')) AS orders_active,
  (SELECT COALESCE(SUM("totalPriceCents"),0) FROM "Order" WHERE EXTRACT(YEAR FROM "createdAt")=2026 AND is_test=false AND "deletedAt" IS NULL AND status::text NOT IN ('CANCELLED','REFUNDED')) AS revenue_2026_cents,
  (SELECT COUNT(*) FROM bank_statement_documents) AS bank_docs,
  (SELECT COUNT(*) FROM bank_statement_lines) AS bank_lines,
  (SELECT COUNT(*) FROM financial_ledger_entries) AS ledger_entries;
SQL
)

STAMP=$(date +%Y%m%d_%H%M%S)
DIR="/tmp/floremoria-backup-verify"
mkdir -p "$DIR"
DUMP="$DIR/neon_prod_${STAMP}.dump"
DIRECT_URL="${DATABASE_URL/-pooler/}"

echo "[1/4] Baseline produzione"
psql "$DATABASE_URL" -c "$SQL"
PROD=$(psql "$DATABASE_URL" -t -A -F ',' -c "$SQL" | tr -d '[:space:]')

echo "[2/4] pg_dump → $DUMP"
pg_dump "$DIRECT_URL" --format=custom --no-owner --no-acl -f "$DUMP"
ls -lh "$DUMP"

echo "[3/4] pg_restore → floremoria_restore_test"
dropdb --if-exists floremoria_restore_test
createdb floremoria_restore_test
pg_restore -d floremoria_restore_test --no-owner --no-acl "$DUMP"

echo "[4/4] Confronto"
psql -d floremoria_restore_test -c "$SQL"
REST=$(psql -d floremoria_restore_test -t -A -F ',' -c "$SQL" | tr -d '[:space:]')

echo "PROD=$PROD"
echo "REST=$REST"
if [[ "$PROD" == "$REST" ]]; then
  echo "MATCH OK"
  exit 0
fi
echo "MISMATCH — backup o restore non affidabile" >&2
exit 1
