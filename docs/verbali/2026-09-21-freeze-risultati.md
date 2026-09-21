# FREEZE UFFICIALE — 21 settembre 2026

**Label:** `FREEZE_UFFICIALE_2026-09-21_DEDUPE_FATTURA_RIMBORSI`  
**Timestamp:** `2026-09-21T15:48:57.316Z`  
**Riferimento di progetto:** questo freeze (21/09). Non usare snapshot precedenti.

## Motore

- Dedupe costi: **fattura passiva** tiene il CE; bonifico = regolamento (allegato).
- Rimborsi cliente (USCITA): **riduzione di ricavo**, non costo operativo.
- Autofatture TD17: categoria `AUTOFATTURE_REVERSE_CHARGE` (fuori ricavi; IVA debito = credito).
- PayPal HAYUM: vendite in `RICAVI_VENDITE` (allineate al registro corrispettivi).
- Check DC Studio: fattura tenuta=`true`, bank soppressa=`true`.

## Risultati

| Voce | Euro |
|------|------|
| Ricavi lordi | 8852,43 |
| — Vendite caratteristiche | 4000,80 |
| — Contributi CCIAA | 4597,66 |
| — Altri ricavi | 32,81 |
| — Rimborsi (netto in ricavi) | 81,21 |
| Costi fioristi | 2687,62 |
| Costi fatture passive | 6134,09 |
| SaaS | 1080,04 |
| Operativi | 2175,64 |
| Oneri bancari | 377,85 |
| EBITDA | -3224,96 |
| **Risultato esercizio** (con CCIAA) | **-3602,81** |
| **Risultato gestione** (senza CCIAA) | **-8200,47** |
| IVA a debito | 262,89 |
| IVA a credito | 1194,06 |
| Saldo banca (Σ linee) | 32.297,53 |

