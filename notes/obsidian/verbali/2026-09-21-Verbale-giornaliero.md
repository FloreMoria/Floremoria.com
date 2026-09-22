---
date: 21-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 21 Settembre 2026"
sync_source: docs/verbali/21-09-2026.md
synced_at: 2026-09-22T03:00:29.968Z
---

> Copia sincronizzata automaticamente da `docs/verbali/21-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 21 Settembre 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-09-21.

## Sezione 1 — Infrastruttura

- `2834fb12` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- `65f5897f` chore(verbali): sincronizzato verbale integrale 21 settembre 2026 _(FloreMoria)_
- `8da6b693` chore(verbali): [skip ci] sync automatico verbale giorno precedente (Europe/Rome) _(github-actions[bot])_
- `d614d9d7` chore(verbali): [skip ci] pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `b03a769d` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_

## Sezione 2 — Strategia

- _Nessuna attività registrata per questa giornata._

## Sezione 3 — Sviluppo

- [2026-09-21 18:10] diag/fiscal: V1/V2 sola lettura IVA TD17 + debito corrispettivi↔CE; C15 + blocco export; METODO 1.28.
- [2026-09-21 22:09] audit(finance): riconferma corrispettivi T1/T2 match; T3 +2 vendite 21/09 (€62,96); chiarito scope filtri vista vs totali fiscali

## Sezione 4 — Logistica

- `654f3832` fix(finance): semplificazione registro transazioni, rimozione righe fantasma Stripe e filtro giroconti PayPal [FLOREM_AUTO_PROT] _(FloreMoria)_
- [2026-09-21 18:35] fix/fiscal: Stripe TD17 31/05 (JSON dup+vat); ARC documentale+work-list; Erario c/IVA patrimoniale; C15 verde T1–T3; commercialista non bloccato.
- [2026-09-21 21:59] fix(finance): registro transazioni — 1 ordine=1 riga; skip Stripe PayPal-passthrough e giroconti T5000/T2002/T5001; accountingSkill giroconto [FLOREM_AUTO_PROT]
- [2026-09-21 22:23] fix(finance): export commercialista — canale PayPal (via Stripe), ref=tx id, note F1, date solo giorno; T1/T2/T3 totali invariati