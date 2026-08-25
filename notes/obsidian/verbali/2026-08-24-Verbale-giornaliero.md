---
date: 2026-08-24
tipo: verbale_giornaliero
tags: [verbale, BARBARA, DEVIN, FLOREM_NET, Regola_Aurea, sync_pipeline]
sommario: "Verbale Operativo FloreMoria — 24 Agosto 2026"
sync_sources: ["git:24h", "prisma:operativita"]
synced_at: 2026-08-25T00:32:38.378Z
redazione: BARBARA (Antigravity) + DEVIN (Cursor)
---

> Pipeline automatica — fonti: git:24h · prisma:operativita.

# Verbale Operativo FloreMoria — 24 Agosto 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-08-24.

## Sezione 1 — Infrastruttura

- [2026-08-24 16:30] feat(verbali): cron 05:00 giorno precedente — Git+.today_log → 4 sezioni, LaunchAgent com.floremoria.dailyverbale, ricostruito verbale 23-08-2026.
- [2026-08-24 17:18] fix(finance): Fase 1 — scadenze/progressivi su Neon SystemState, webhook senza x-mock-provider, requireDashboardAdmin con User DB, upsert sourceKey stabile, SHA-256 estratti Fineco, numerazione autofatture atomica.
- [2026-08-24 17:31] feat(finance): Fase 2 — TRASFERIMENTO_INTERNO payout Stripe/PayPal, doppio binario Cassa/Fisco IVA 10%/22%, motore riconciliazione unico Neon, scadenziario senza filtro 90gg, statements da FinancialLedgerEntry+BankStatementLine.
- [2026-08-24 21:10] fix(finance): Prima Nota partita doppia — classificazione PayPal (Google One/SaaS, skip netto/conversione), conti 10200/10300 vs Fineco 10100, dedup Stripe↔PayPal e GATEWAY↔MANUALE, sanitizzazione soft-reverse Neon 24/08.

## Sezione 2 — Strategia

- `74f5b39` chore(verbali): pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_

## Sezione 3 — Sviluppo

- [2026-08-24 17:47] feat/ui: FASE 3 Contabilità — 5 tab, fascia quadratura, BankStatementsPanel variant tab1.
- [2026-08-24 17:48] feat(finance): Fase 3 — UI 5 tab (Banca/Prima Nota/Passivo/Gateway/Fisco), fascia quadratura server-side, IBAN compatto, storico documenti preservato; tsc+build OK.
- [2026-08-24 17:48] feat(finance): Fase 3 — UI 5 tab (Banca/Prima Nota/Passivo/Gateway/Fisco), fascia quadratura server-side, IBAN compatto, storico documenti preservato; tsc+build OK.
- [2026-08-24 18:55] fix(finance): Parte 1 rifiniture — header societario Fineco, dedup Prima Nota max-h 20 righe, storico autofatture 450–600px, FT-ME-26-001→Torre, match automatico anagrafica/città, fatture in attesa da 01/01/2026.
- [2026-08-24 21:20] fix(finance): bonifica retroattiva 2026 FinancialLedgerEntry — falsi ricavi SaaS, Importo pagato/esborso, auth dupes, bankfee JSON, conti 10100/10200/10300; harden classify/sync/parser.
- [2026-08-24 21:55] fix(finance): saldo iniziale/finale Fineco da PDF → openingBalanceCents + quadratura (apertura+movimenti / ultima chiusura); backfill Q1-Q2; UI Reale/Libro/Diff.

## Sezione 4 — Logistica

- [2026-08-24 16:11] prompt(vera): affinamento tono & riservatezza implicita — rimozione tecnicismi/note di instradamento interno ("non viene condivisa col fiorista"), aggiunta few-shot ed esempi in system prompt.
- [2026-08-24 19:10] fix(finance): Parte 2 — dedup gateway txn/charge+colori +/-; scadenziario da 01/07/2026; edit registro corrispettivi (lordo/fee); fee mensili PayPal gemelle Stripe; tsc+build OK.
- Nuovi ordini registrati: **1**
- Pagamenti confermati: **32**
- Consegne completate: **33**
