# Ripristino database Neon — procedura eseguibile

**Ultima verifica reale:** 2026-09-17 (vedi `docs/verbali/17-09-2026-backup-restore-verify.json`)  
**Esito:** dump Neon → `pg_restore` su PostgreSQL 17 locale → **MATCH** con produzione.

---

## Cosa c’è oggi (backup)

| Elemento | Stato |
|----------|--------|
| Hosting DB | Neon PostgreSQL 17 (`ep-wild-field-…eu-central-1`) |
| Backup gestito Neon | Point-in-Time Recovery (PITR) incluso nel piano Neon del progetto — retention tipica da console Neon (Launch/Scale). **Non** c’è uno script repo che copia dump su S3. |
| Dump manuale verificato | `pg_dump --format=custom` dall’endpoint **diretto** (senza `-pooler`) |
| Backup “file” automatico in repo | Assente (voluto: i dump non vanno in git) |

Frequenza operativa consigliata: oltre al PITR Neon, un dump offline mensile (o a ogni chiusura trimestre) sul Mac di Salvatore, insieme all’archivio fiscale.

---

## Prerequisiti Mac

```bash
brew install libpq postgresql@17
brew services start postgresql@17
export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/opt/libpq/bin:$PATH"
```

Serve `DATABASE_URL` di produzione (da `.env` locale o Vercel env — **mai** committata). Preferire l’host **senza** `-pooler` per dump coerenti.

---

## A. Verifica “il backup funziona” (drill, non disaster)

1. Contatori produzione (baseline):

```bash
psql "$DATABASE_URL" -c "
SELECT
  (SELECT COUNT(*) FROM \"Order\" WHERE is_test = false AND \"deletedAt\" IS NULL
     AND status::text NOT IN ('CANCELLED','REFUNDED')) AS orders_active,
  (SELECT COALESCE(SUM(\"totalPriceCents\"),0) FROM \"Order\"
     WHERE EXTRACT(YEAR FROM \"createdAt\")=2026 AND is_test=false AND \"deletedAt\" IS NULL
     AND status::text NOT IN ('CANCELLED','REFUNDED')) AS revenue_2026_cents,
  (SELECT COUNT(*) FROM bank_statement_documents) AS bank_docs,
  (SELECT COUNT(*) FROM bank_statement_lines) AS bank_lines,
  (SELECT COUNT(*) FROM financial_ledger_entries) AS ledger_entries;
"
```

2. Dump:

```bash
mkdir -p /tmp/floremoria-backup-verify
STAMP=$(date +%Y%m%d_%H%M%S)
DIRECT_URL=$(echo "$DATABASE_URL" | sed 's/-pooler//')
pg_dump "$DIRECT_URL" --format=custom --no-owner --no-acl \
  -f "/tmp/floremoria-backup-verify/neon_prod_${STAMP}.dump"
```

3. Restore su DB di prova **locale** (non toccare Neon):

```bash
dropdb --if-exists floremoria_restore_test
createdb floremoria_restore_test
pg_restore -d floremoria_restore_test --no-owner --no-acl \
  "/tmp/floremoria-backup-verify/neon_prod_${STAMP}.dump"
```

4. Stessi contatori sul restore; devono coincidere al centesimo.

**Numeri verifica 2026-09-17**

| Metrica | Produzione | Restore | Match |
|---------|------------|---------|-------|
| Ordini attivi | 83 | 83 | sì |
| Fatturato 2026 (`totalPriceCents`) | 439864 (= €4.398,64) | 439864 | sì |
| Documenti bancari | 10 | 10 | sì |
| Righe bancarie | 193 | 193 | sì |
| Voci ledger | 1495 | 1495 | sì |

---

## B. Disaster recovery su Neon (produzione)

Usare la console Neon del progetto:

1. **Branches → Create branch** da un timestamp PITR (o branch da parent).
2. Puntare un env di staging / preview Vercel a quel branch e verificare i contatori.
3. Solo dopo match: promuovere (o restore) secondo runbook Neon del piano attivo.
4. Aggiornare `DATABASE_URL` / `DATABASE_URL_UNPOOLED` su Vercel **solo** dopo smoke test dashboard.

Se serve ripristino da dump file (offline):

```bash
# ATTENZIONE: distruttivo sul target. Usare solo su branch di prova Neon o DB vuoto.
pg_restore -d "$TARGET_DATABASE_URL" --clean --if-exists --no-owner --no-acl dump.dump
```

---

## C. Note operative

- `pg_dump` client ≥ versione server (Neon = 17). Client 16 fallisce; usare `libpq` Homebrew o `postgresql@17`.
- Non committare dump `.dump` / `.sql`.
- Dopo restore di prova: `dropdb floremoria_restore_test` per liberare disco.
- Script archivio trimestre: `npm run finance:quarter-closure -- --year=2026 --quarter=3` (fotografia fiscale; non sostituisce il dump DB).
