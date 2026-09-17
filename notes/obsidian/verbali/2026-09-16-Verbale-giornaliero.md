---
date: 16-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 16 Settembre 2026"
sync_source: docs/verbali/16-09-2026.md
synced_at: 2026-09-17T03:00:06.889Z
---

> Copia sincronizzata automaticamente da `docs/verbali/16-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 16 Settembre 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-09-16.

## Sezione 1 — Infrastruttura

- `68b36d3c` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- `c50fa3fd` chore(verbali): [skip ci] sync automatico verbale giorno precedente (Europe/Rome) _(github-actions[bot])_
- `182a9e31` chore(verbali): [skip ci] pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `ef196be7` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_

## Sezione 2 — Strategia

- `eae7bc06` docs(verbali): hash su verbale registro violazioni VIO-2026-001 _(FloreMoria)_

## Sezione 3 — Sviluppo

- `fe95e3ba` docs(verbali): hash quarto canale Connect _(FloreMoria)_
- `8b929203` docs(verbali): hash chiavi live e audit privacy _(FloreMoria)_
- `9636b4d7` docs(privacy): registro violazioni VIO-2026-001 e METODO 1.23 _(FloreMoria)_
- `809a8ed9` docs(finance): tabella guida Contabilità dashboard per Salvatore e commercialista _(FloreMoria)_
- [2026-09-16 16:06] docs(finance): guida tabella Contabilità dashboard (CSV owner vs commercialista).

## Sezione 4 — Logistica

- `d3b4ff47` feat(finance): quarto canale Stripe Connect partner _(FloreMoria)_
- `ae68a0e8` fix(partner): sblocca chiavi live senza Connect; chiude audit privacy _(FloreMoria)_
- `a1ae10a9` docs(verbali): hash e tsc/build su incidente privacy fiorista _(FloreMoria)_
- `419270a9` fix(privacy): blocco email fiorista e FloristOrderBrief (FF-PN-26-005) _(FloreMoria)_
- `51eaf387` feat(partner): tre categorie B2B, FF-VE-26-001, fee C14 e Hub _(FloreMoria)_
- [2026-09-16 10:58] ops(orders): PT-VE-26-002 promosso da isTest=true a ordine reale (fiorista LA ROSA ROSSA + AF).
- [2026-09-16 17:13] feat/partner: modello 3 categorie + FF-VE-26-001 + fee C14 + Hub; chiavi live bloccate (Connect AF assente).
- [2026-09-16 18:11] incidente/privacy: kill switch email fiorista ON; FloristOrderBrief; ampienza Resend 2 path 2026 (1 delivered FF-PN-26-005); METODO 1.22 §14; test:florist-privacy in prebuild; verbale 16-09-2026.
- [2026-09-16 18:30] compliance/privacy: REGISTRO_VIOLAZIONI_DATI.md + VIO-2026-001; fioristi@ = casella interna monoutente; METODO 1.23; termine notifica 19/09.
- [2026-09-16 18:45] feat/partner+privacy: chiavi live AF/IOF senza gate Connect; audit contenuto Resend 1 hit; kill switch solo se =1; VIO-2026-001 notifica No motivata.
- [2026-09-16 22:50] feat/finance: quarto canale Stripe Connect partner (3 gambe + payout Fineco atteso); Guida C1–C14; seed FF-VE-26-001; METODO 1.24.