---
date: 29-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 29 Settembre 2026"
sync_source: docs/verbali/29-09-2026.md
synced_at: 2026-09-30T03:00:02.966Z
---

> Copia sincronizzata automaticamente da `docs/verbali/29-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 29 Settembre 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-09-29.

## Sezione 1 — Infrastruttura

- `a508a2db` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- `62111b26` chore(verbali): [skip ci] sync automatico verbale giorno precedente (Europe/Rome) _(github-actions[bot])_
- `00b85148` chore(verbali): [skip ci] pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `8068d179` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- [2026-09-29 10:55] feat/op4-leader-zone: branch feat/florist-leader-zone-coordination — affido Leader + spunta collega 10%; 7/7 test PASS su neon_branch ep-gentle-rice (dev-florist-network). NON main.
- [2026-09-29 10:53] feat/op4: Affido Leader zona + 10% coordinamento; 7/7 PASS su Neon ep-gentle-rice (dev-florist-network); preview branch feat/florist-leader-zone-coordination (no merge).
- [2026-09-29 11:20] merge/deploy Op4: affido Leader zona + 10% coordinamento su Production (e6e5dc29); FF-PN×5 invariati; cleanup test su gentle-rice; rollback dpl_EfaAcuqwgX99vtF8DwPY9RxgUBoJ.
- [2026-09-29 11:30] fix: Rete&QR Leader — elenco affidati a collega + KPI coordinamento su deliveryDate; FF-PN-26-005 verificato su ep-wild-field; deploy ac522280.
- [2026-09-29 11:50] fix: Fee QR→mese pagamento, coord/compenso→consegna; null-safe cancellationCause; prospetto Art.9; deploy 33a095d0 Production.

## Sezione 2 — Strategia

- _Nessuna attività registrata per questa giornata._

## Sezione 3 — Sviluppo

- `33a095d0` fix(florist-network): fee QR su mese pagamento; null-safe su cancellationCause _(FloreMoria)_
- `f9b673bb` fix(florist-network): spunta collega anche su COMPLETED + notifica Leader _(FloreMoria)_
- `742c21c5` feat(florist-network): affido Leader di zona e 10% coordinamento (Op4) _(FloreMoria)_

## Sezione 4 — Logistica

- `3b5556c3` fix(orders): set paidAt anche da dashboard quando si marca PAID _(FloreMoria)_
- `3cdd2f9c` feat(orders): Order.paidAt da webhook Stripe per mese fee QR _(FloreMoria)_
- `ac522280` fix(florist-network): elenco affidati a collega e KPI su mese consegna _(FloreMoria)_
- [2026-09-29 12:00] feat: Order.paidAt (migrazione prod + webhook Stripe); confronto readonly createdAt vs deliveryDate ago/set 2026 (3 movers).