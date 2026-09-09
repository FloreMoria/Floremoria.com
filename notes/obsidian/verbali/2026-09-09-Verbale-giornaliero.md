---
date: 09-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 9 Settembre 2026"
sync_source: docs/verbali/09-09-2026.md
synced_at: 2026-09-09T22:06:23.926Z
---

> Copia sincronizzata automaticamente da `docs/verbali/09-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 9 Settembre 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-09-09.

## Sezione 1 — Infrastruttura

- `7c1d8148` fix(api): idempotenza su paymentIntentId ed esecuzione asincrona notifiche per evitare timeout _(FloreMoria)_
- `a1e3e1c4` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- `7b3c4a88` chore(verbali): [skip ci] sync automatico verbale giorno precedente (Europe/Rome) _(github-actions[bot])_
- `b1a6d45e` chore(verbali): [skip ci] pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `4d55a40f` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_

## Sezione 2 — Strategia

- [2026-09-09 17:55] docs: inventario stato contabilità (sola lettura) → docs/INVENTARIO_CONTABILITA.md su commit f754058d.
- [2026-09-09 19:10] finance/dossier: generati T1/T2/T3 2026 v1.9 in docs/verbali (bypass locale STOP mancante solo per export; codice ripristinato)

## Sezione 3 — Sviluppo

- `574007cf` feat(finance): dossier v1.9 per liquidazione IVA commercialista _(FloreMoria)_
- `77d94af9` docs(verbali): STOP censimento paste Fineco — T3/2025-T4 solo paste _(FloreMoria)_
- `3162def5` fix(finance-ui): allinea copy movimenti banca — solo file ufficiale, no incolla _(FloreMoria)_
- `926c14d1` refactor(finance): eliminato incolla estratto conto, registro corrispettivi v1.7 a 3 stati, badge 10 controlli in UI e rimozione costanti hardcoded _(FloreMoria)_
- `e398ba24` docs: corregge conteggi riassuntivi inventario contabilità _(FloreMoria)_
- `2ee15a5c` docs: inventario verificato dello stato contabile (METODO v1.7 vs codice) _(FloreMoria)_
- [2026-09-09 18:40] refactor(finance): chiuso confirmFinecoPaste (METODO §2 + validazione saldi); Registro Corrispettivi §8.3 a 3 stati + DOSSIER_METHOD_VERSION 1.7; badge C1–C10 in UI; rimosso capitale sociale hardcoded €11.410.
- [2026-09-09 18:45] fix(finance-ui): copy BankMovementsStatementTable senza incolla.
- [2026-09-09 18:57] finance/dossier: METODO+export v1.9 commercialista (gateway corrispettivi, Liquidazione in testa, controlli in coda); C3 non verificabile; badge da snapshot SystemState

## Sezione 4 — Logistica

- `1864541f` fix(finance): collega incassi gateway agli ordini (avanti + audit RO) _(FloreMoria)_
- `f754058d` feat(whatsapp): integrati e registrati i template recensione floremoria_recensione_tomba e floremoria_recensione_funerale per Meta Live e dashboard _(FloreMoria)_
- [2026-09-09 16:55] fix(api): idempotenza partner su paymentIntentId/Idempotency-Key + after() notifiche (anti-timeout/doppi PT-VE); CANCELLED PT-VE-26-005/006 sandbox; unique stripe_transaction_id.
- [2026-09-09 19:35] finance: collegamento incassi↔ordini — checkout PI metadata + webhook salva pi_; campo TX su ordine manuale; reconcile RO T1–T3; blocco 30% intatto