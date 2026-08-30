---
date: 29-08-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 29 Agosto 2026"
sync_source: docs/verbali/29-08-2026.md
synced_at: 2026-08-30T02:01:26.039Z
---

> Copia sincronizzata automaticamente da `docs/verbali/29-08-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 29 Agosto 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-08-29.

## Sezione 1 — Infrastruttura

- [2026-08-29 09:13] fix: cron dispatch social 09:00 Rome, sync media multicanale, force-publish-today; recupero IG/FB/LinkedIn/Pinterest 29-08
- [2026-08-29 10:20] feat(finance): client YouDOX SOAP/REST per ricezione automatica fatture passive e sync esiti SDI — creato FinancialYoudoxClient in lib/financial/youdoxClient.ts con auth cache OAuth 3600s, wrapper fetchUnreadInvoices/downloadInvoiceXml/markInvoiceAsRead/syncStatusReports, route unificata /api/v1/finance/youdox/sync con matching automatico P.IVA fornitori/fioristi e pulsante "Sincronizza YouDOX SDI" in SdiInvoicesUploadBox.

## Sezione 2 — Strategia

- `4894a4c` chore(verbali): pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_

## Sezione 3 — Sviluppo

- [2026-08-29 09:23] refactor: tabella gateway finance raggruppata per ordine, link FM, vista semplificata vs log grezzo

## Sezione 4 — Logistica

- [2026-08-29 08:53] fix(dashboard): titoli schede sintetici (Fioristi, Log, Chat) con suffisso pulito FloreMoria e robots noindex — ripristinato template '%s | FloreMoria' in layout.tsx, abilitata direttiva robots noindex/nofollow per l'area amministrativa riservata ed aggiornati i titoli browser di Fioristi, Log e Chat.
- [2026-08-29 10:15] fix(finance): deduplicazione Prima Nota — consolidateReconciledPayments su bankLineId/ordine, badge documenti SDI/manuali, script clean-duplicate-accounting-entries, PnL senza doppio conteggio fioristi; tsc+build OK.
- Pagamenti confermati: **2**
- Consegne completate: **1**