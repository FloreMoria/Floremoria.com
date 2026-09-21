# FREEZE UFFICIALE — 21 settembre 2026

**Label:** `FREEZE_UFFICIALE_2026-09-21_ERARIO_IVA_C15`  
**Timestamp:** `2026-09-21T16:29:06.048Z`  
**Riferimento di progetto:** questo freeze (21/09). Non usare snapshot precedenti.

## Motore

- Dedupe costi: **fattura passiva** tiene il CE; bonifico = regolamento (allegato).
- Rimborsi cliente (USCITA): **riduzione di ricavo**, non costo operativo.
- Autofatture TD17: IVA letta dai documenti (credito solo fino al debito).
- Erario c/IVA patrimoniale (debito = corrispettivi; credito = fatture passive).
- C15 T1–T3: `true`.
- Check DC Studio: fattura tenuta=`true`, bank soppressa=`true`.

## Risultati CE

| Voce | Euro |
|------|------|
| Ricavi lordi | 8655,74 |
| — Vendite caratteristiche | 4000,80 |
| — Contributi CCIAA | 4597,66 |
| — Altri ricavi | 32,81 |
| — Rimborsi (netto in ricavi) | -115,48 |
| Costi fioristi | 1416,62 |
| Costi fatture passive | 5694,09 |
| SaaS | 880,49 |
| Operativi | 1420,26 |
| Oneri bancari | 253,09 |
| EBITDA | -755,72 |
| **Risultato esercizio** (con CCIAA) | **-1008,81** |
| **Risultato gestione** (senza CCIAA) | **-5606,47** |
| IVA PnL (ARC documentale) debito / credito | 254,03 / 1123,85 |
| Saldo banca (Σ linee) | 32.297,53 |

## Stato patrimoniale — Erario c/IVA

| Voce | Euro |
|------|------|
| IVA a debito (da corrispettivi) | 403,69 |
| IVA a credito (da fatture passive) | 40,02 |
| **Saldo Erario** (debito − credito) | **363,67** |

## C15
- OK: C15 OK T1 2026: Erario debito=94.43 = corr; credito=5.64 = fatture.
- OK: C15 OK T2 2026: Erario debito=113.29 = corr; credito=0.00 = fatture.
- OK: C15 OK T3 2026: Erario debito=195.97 = corr; credito=34.38 = fatture.

