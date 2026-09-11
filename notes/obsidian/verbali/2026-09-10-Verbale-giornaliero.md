---
date: 10-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 10 Settembre 2026"
sync_source: docs/verbali/10-09-2026.md
synced_at: 2026-09-11T03:00:12.073Z
---

> Copia sincronizzata automaticamente da `docs/verbali/10-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 10 Settembre 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-09-10.

## Sezione 1 — Infrastruttura

- `97cdefd8` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- `25b3102d` chore(verbali): [skip ci] sync automatico verbale giorno precedente (Europe/Rome) _(github-actions[bot])_
- `15e1ca33` chore(verbali): [skip ci] pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `ea0ff438` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- `f742f5d1` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_

## Sezione 2 — Strategia

- _Nessuna attività registrata per questa giornata._

## Sezione 3 — Sviluppo

- `1c0c3556` fix(finance): gateway vince su lista .eu e METODO v1.12 aliquote per riga _(FloreMoria)_
- `2c4a6282` feat(finance): Fineco lista movimenti periodo aperto (METODO v1.10) _(FloreMoria)_
- [2026-09-10 15:44] docs: Report scansione verbali 15-07→10-09-2026 — solo perimetro finance/dossier/IVA/gateway (fatto vs aperto).
- [2026-09-10 15:55] docs: Confronto report finance Cursor vs Claude Obsidian (15/07–10/09) — allineamenti, divergenze, conclusioni.
- [2026-09-10 16:31] finance/dry-run: Import storico .eu 2026 — 34 candidati €1.952,01; gateway 33/34; prodotto mancante Carnet; 0 scritture.
- [2026-09-10 17:29] fix(finance): dedupe fatture passive §2 = P.IVA+numero (XML>Report>manuale); aliquota da fonte no stima 10.01%; METODO v1.11 — tabella Contabilità -12 righe / €619,01.
- [2026-09-10 17:57] finance: gateway vince su lista .eu (Amanda 39,99); METODO v1.12 §8.2/§8.3; diagnosi residuo MANCANTE T2/T3; batch EU_HIST già in DB 33+47.

## Sezione 4 — Logistica

- `029008d9` fix(api-partner): deduplica ristretta esclusivamente a chiave pagamento, rimosso annuncioId da query OR _(FloreMoria)_
- [2026-09-10 11:55] audit/forense: partner order/create idempotenza — PT-VE-26-002 hit su externalAnnouncementId 147182, non su PI; 0 create oggi; after() saltato su duplicate
- [2026-09-10 12:00] fix(api-partner): idempotenza solo su paymentKey — rimosso annuncioId/externalAnnouncementId dalla deduplica
- [2026-09-10 16:47] finance/feat: Import storico .eu 33 ordini batch EU_HIST_20260910_A (no ledger/notify); fix TX: PayPal; T1 mancante 1,8% OK — T2/T3 ancora >30%.
- [2026-09-10 17:37] finance/readonly: fixture 43 ordini .eu 2026 + match gateway (Isabella 284,90); MANCANTE T1 38%→1,8% OK · T2 56,7%→47,6% NO · T3 ~50%→49,8% NO; Fineco paste PROVVISORIO invariato; ZERO write DB.