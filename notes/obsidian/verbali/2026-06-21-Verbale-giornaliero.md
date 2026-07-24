---
date: 21-06-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Migration Neon — tabella EmailBlacklist (21–22 Giugno 2026)"
sync_source: docs/verbali/21-06-2026.md
synced_at: 2026-07-24T10:07:24.525Z
---

> Copia sincronizzata automaticamente da `docs/verbali/21-06-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Migration Neon — tabella EmailBlacklist (21–22 Giugno 2026)

**Argomento:** Allineamento schema Prisma su Neon produzione + risponditore email assistenza@  
**Stato:** 🟢 **Completato e verificato in produzione** (22/06/2026)  
**Repo:** `FloreMoria/Floremoria.com` — commit `09ef09b` (feature), `86fbd77` (workflow), `7a2e210` (fix verify)

## Test pendente

- [ ] **Blacklist spam Aruba:** al prossimo arrivo da `comunicazioni@staff.aruba.it` verificare che il cron **ignori** la mail (nessuna risposta VERA, nessun log bacheca, mail marcata letta).  
  → Aggiungere l’indirizzo in dashboard se non già in lista.

---

## Contesto tecnico

Dopo il deploy POSTMAN (blacklist + invio diretto SMTP, commit `09ef09b`), serviva la migration:

- `prisma/migrations/20260621120000_email_blacklist/migration.sql`

Senza tabella su Neon: crash API admin e cron su `prisma.emailBlacklist`.

---

## Percorso risoluzione

| Step | Esito |
|------|--------|
| Deploy codice su `main` | ✅ |
| Workflow GitHub **Database migrate deploy** | ✅ (warning Node 20 → innocuo) |
| `migrate deploy` + verify con `DATABASE_URL_UNPOOLED` Neon | ✅ |
| Fix script verify (`regclass` → `::text`) | ✅ commit `7a2e210` |
| DB Docker locale (P3009 drift) | ✅ risolto con `migrate resolve` |

**Nota locale:** comandi senza URL Neon puntano a `localhost:5432` — normale per dev.

---

## Comandi utili

```bash
# Verifica produzione (incolla URL da Vercel → DATABASE_URL_UNPOOLED)
DATABASE_URL_UNPOOLED='postgresql://…@ep-….neon.tech/…' npm run db:verify:email-blacklist

# Solo Docker locale
npm run db:verify:email-blacklist   # → warning localhost

# Sblocco migration locale incoerente
npm run db:migrate:resolve-failed
```

---

## File correlati (backend)

| File | Ruolo |
|------|--------|
| `prisma/schema.prisma` | Model `EmailBlacklist` |
| `lib/postman/emailBlacklist.ts` | Lookup / CRUD |
| `lib/postman/mailbox.ts` | IMAP in + SMTP invio diretto |
| `app/api/dashboard/email-blacklist/route.ts` | API admin |
| `app/api/cron/postman-sync/route.ts` | Filtro blacklist + risposta automatica |
| `app/dashboard/communications/CommunicationsHubClient.tsx` | UI blacklist (tab Configurazione) |
| `.github/workflows/db-migrate-deploy.yml` | Migration Neon via GitHub secret |

---

*Log aggiornato 22/06/2026 — sessione Cursor, verifica Neon OK, mail assistenza@ operativa*