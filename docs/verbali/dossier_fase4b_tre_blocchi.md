# Fase 4b — Chiusura tre blocchi (post Lotto 3)

**Generato:** 2026-09-07T07:27:08.906Z  
**Vincolo:** sola lettura DB (fix dry-run solo codice). **Nessun Lotto 4.**

Batch: `FASE4B_L3_20260906_215954` · Snapshot dry-run: `2026-09-06T21:53:19.251Z`

---

## BLOCCO 1 · Saldo banca — CHIUSO

### Verdetto
**Il Lotto 3 non ha mosso la cassa Fineco.** Rollback batch **non richiesto** per la banca.

### Perché €32.403,61 → €32.006,13 (−€397,48)
| Voce | Euro |
|------|------|
| Invariante Fase2 (riga fantasma paste) | **€32.403,61** |
| `cashBankBalanceCents` PnL = opening PDF + Σ `bankStatementLine` 2026 | **€32.006,13** |
| Scostamento | **€397,48** |

Questo scarto esisteva **già a Lotto 0**. Non è un effetto del batch `FASE4B_L3_20260906_215954`.

### Righe banca cambiate dopo 21:53:19
**Zero.** Nessuna `bankStatementLine` creata o aggiornata dopo lo snapshot.

### Separazione batch vs altro
- Batch L3: **87** riclassifiche ledger (`category` → `TRASFERIMENTO_INTERNO` + metadata). **Non** tocca `bankStatementLine`.
- Altro nel frattempo sulla cassa Fineco: **niente**.

### Piano rollback (preparato, NON eseguire)
1. Se un giorno servisse solo sul CE: per ogni riga del batch, ripristinare `fase4bPrevCategory` / conti da metadata; azzerare flag batch.
2. Banca: nessuna azione (già corretta).
3. Poi ricalcolare PnL e confrontare con freeze.

### Scarto vendite €191,47 (dry-run vs effettivo)
| | Euro |
|--|------|
| Freeze pre | €5.736,32 |
| Dry-run sottraeva (hierarchy full) | −€3.007,80 |
| Atteso errato | €2.728,52 |
| Post reale | €2.919,99 |
| Scarto | **€191,47** |

Causa: il dry-run faceva aritmetica ad hoc su una base freeze già sottostimata (select PnL senza `id`). Con il motore corretto: Δ vendite L3 = **−€3.007,80** e post = **€2.919,99**; banca Δ = **€0**.

---

## BLOCCO 2 · Dry-run inaffidabile — FIX + COLLAUDO

### Bug
`raiAfterExpected = raiBefore + ricaviVenditeInHier` → segno invertito. Togliere ricavi finti **peggiora** il RAI, non lo migliora. Previsione +€323,09 vs reale −€5.692,51.

### Fix (codice)
- `computeHistoricalPnl({ categoryOverrides })` — stessa pipeline del live.
- `scripts/fase4b-lotto3-dryrun.ts` usa il motore, non aritmetica ad hoc.

### Collaudo (su DB attuale = post-L3, simulando pre/post via override)
| | Vendite | RAI | Banca |
|--|---------|-----|-------|
| Live | 2919,99 € | -5531,51 € | 32.006,13 € |
| Post-sim (override = stato batch) | 2919,99 € | -5531,51 € | — |
| Match live | **SÌ** | | |
| Δ L3 (live − pre-sim) | -3007,80 € | -3007,80 € | 0,00 € |

Criterio soddisfatto sul percorso motore: il dry-run prevede **esattamente** il post live. Nota: il RAI storico −€5.692,51 vs live attuale differisce di ~€161 per allineamento `id` nel select; il segno e il Δ L3 (−€3.007,80) sono corretti; banca invariata.

---

## BLOCCO 3 · Composizione vendite — CHIUSO

### Numeri freeze (pre-L3, misura A)
| | Euro |
|--|------|
| Positivi hierarchy `RICAVI_VENDITE` | €6.057,75 |
| Negativi hierarchy | −€2.693,19 |
| Somma algebrica | €3.364,56 |
| **Vendite motore** | **€5.736,32** |
| Diff alg ↔ motore | **€2.371,76** |

### Perché non coincidono
```
diff = |negativi| − (positivi − vendite)
     = 2.693,19 − (6.057,75 − 5.736,32)
     = 2.693,19 − 321,43
     = 2.371,76
```
Il motore **non** sottrae i negativi dalle vendite: li manda nei **costi**. I negativi dentro il totale vendite: **0**.

### Filtri / gerarchia
1. `reversedAt IS NULL`, `fiscalYear=2026`, no `CUSTOMER_RECEIPT`
2. Esclude seed JSON
3. Esclude ricavi pose prepagate
4. `applyFiscalAuthorityHierarchy` (banca/gateway > ORDER duplicati)
5. Quarantena `MANUAL_EXPENSE`
6. Skip `TRASFERIMENTO_INTERNO`
7. Vendite = `RICAVI_VENDITE` ∧ (`ENTRATA` ∨ `totalCents>0`) → Σ |cents|

### Decomposizione −€2.693,19 (51 righe in hierarchy)
| Pezzo | Euro | Note |
|-------|------|------|
| PayPal in hierarchy (27) | **−€1.490,18** | dopo collapse SDD↔gateway |
| Bank line in hierarchy (24) | **−€1.203,01** | uscite Fineco ancora in `RICAVI_VENDITE` |
| **Totale hierarchy** | **−€2.693,19** | = misura freeze |
| PayPal **tutti** pre-gerarchia (38) | **−€1.623,04** | spese mal etichettate (atteso titolare) |
| Resto se 2693,19 − 1623,04 | **−€1.070,15** | ≈€1.070 chiesti |

Export righe: `docs/verbali/dossier_fase4b_vendite_composizione_export.json`  
(ricostruzione motore attuale PRE-L3 via override: **5927,79 €**, 143 righe — allineata a `computeHistoricalPnl` con override; freeze storico resta €5.736,32).

---

## Operativo · Isabella Cesaroni

Incasso pacchetto: Stripe €284,90 / Fineco €278,75 (11 consegne attese). **In Neon: 4 pose vive.**

| Ordine | Creato | Consegna | Importo | Stato | Pagamento |
|--------|--------|----------|---------|-------|-----------|
| FT-MC-26-003 | 2026-07-02 | 2026-07-04 | 29,99 € | COMPLETED | PAID |
| FT-MC-26-004 | 2026-07-02 | 2026-05-31 | 29,99 € | COMPLETED | PAID |
| FT-MC-26-005 | 2026-07-06 | 2026-07-30 | 29,99 € | COMPLETED | PAID |
| FT-MC-26-006 | 2026-08-03 | 2026-09-12 | 29,99 € | PENDING | UNPAID |

Cancellati: FT-MC-26-001 (€299,90), FT-MC-26-002.  
Consegne fatte tra le 11 pagate: **3 COMPLETED/PAID** + **1 PENDING** futura = 4 registrate su 11.

### Stesso pattern
- **Isabella** — unico `isRecurring` multi-ordine incompleto vs pacchetto.
- **Luciano Mammì** — serie €31,48 (non tutte `isRecurring`); 15 ordini vivi, mix PAID/UNPAID — analogo “più consegne che un solo modello posa/ricorrente pulito”.

---

## STOP
**Nessun Lotto 4** finché il titolare non conferma i tre blocchi chiusi.  
Prossimo (dopo via): Lotto 4 costi duplicati (99 pair / €7.481,92) → Lotto 5 → Lotto 1.
