# Verbale — 17-09-2026 · Accessi finance · backup verificato · archivio trimestre

## Contesto
Tre filoni: **A** diagnosi accessi Contabilità (sola lettura); **C** prova restore DB; **D** pacchetto chiusura trimestre. **B** (ruoli/2FA/registro) in attesa conferma.

## A — Diagnosi
Documento: `docs/DIAGNOSI_ACCESSI_FINANCE_2026-09-17.md`

- Accesso `/dashboard/finance`: solo **ADMIN** e **SUPER_ADMIN** (non “sei loggato”).
- Account attivi: `ceo@floremoria.com` (SUPER_ADMIN), `staff.floremoria@gmail.com` (ADMIN).
- Nessuna ACL a grana fine (margini/banca = stessi utenti). Nessuna 2FA staff. Nessun registro accessi/export.
- Segreti tracciati in `.env.vercel.check` / `.env.vercel.production.local` → rimossi dall’indice git + `.gitignore` rafforzato (rotazione chiavi consigliata).

Emergenza (non piano B): blindate `connect-partner` e `partner-fee-invoices` con `requireDashboardAdmin`.

## C — Backup
- Neon PG17 + PITR piattaforma; dump manuale verificato.
- Restore reale: `pg_dump` → `pg_restore` su `floremoria_restore_test` (PostgreSQL 17 locale).
- **MATCH** produzione = restore: ordini 83 · fatturato 2026 €4.398,64 · bank docs 10 · bank lines 193 · ledger 1495.
- Doc: `docs/BACKUP_RESTORE_NEON.md` · JSON: `docs/verbali/17-09-2026-backup-restore-verify.json`
- Script: `npm run db:backup:verify-restore`

## D — Archivio fiscale locale
- `npm run finance:quarter-closure -- --year=YYYY --quarter=N`
- ZIP immutabile in `archives/fiscal-closures/` (se esiste → versione `_vYYYYMMDD_HHMM`).
- Contenuto: dossier XLSX, corrispettivi, estratti, fatture passive+allegati, esiti C1–C14, README+manifest.
- Generato in locale (non in git): `archives/fiscal-closures/FloreMoria_2026_T3_chiusura.zip` (~8.5 MB), con warning MANCANTE 49.5% (fotografia; export Contabilità resta fail-closed).

## Verifiche
- `tsc --noEmit` OK · `npm run build` OK

## Prossimo
Attesa conferma Salvatore per piano **B** (ruoli titolare/operativo/sola lettura, admin separato, 2FA, access log).
