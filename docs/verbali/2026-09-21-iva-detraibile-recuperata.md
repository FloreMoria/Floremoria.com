# IVA detraibile recuperata — dedupe fattura > bonifico

**Data:** 21 settembre 2026  
**Motivo:** inversione priorità dedupe costi (il CE tiene la **fattura passiva**, il bonifico è regolamento).  
Prima il motore teneva la bank line (`vatCents=0`) e scartava la fattura → IVA a credito persa.

## Totale recuperato

**€591,84** di IVA detraibile ora conteggiata nel PnL / gerarchia fiscale  
(stima operativa precedente ≈ €581,35; il motore misura **sette** costi con fattura tenuta e bonifico soppresso).

## Per trimestre 2026

| Trimestre | IVA a credito recuperata |
|-----------|-------------------------:|
| T1 | €557,19 |
| T2 | €22,10 |
| T3 | €12,55 |
| T4 | €0,00 |
| **Totale** | **€591,84** |

## Dettaglio costi (fattura tenuta, bonifico allegato)

| Fornitore | Data | Trim. | Imponibile/totale | IVA |
|-----------|------|------:|------------------:|----:|
| Battistella Fioreria srl | 2026-06-30 | T2 | €50,00 | €4,55 |
| BONFANTE CLAUDIA | 2026-06-23 | T2 | €40,00 | €3,64 |
| TORRE DOMENICA | 2026-06-19 | T2 | €62,00 | €11,18 |
| LA PRIMAVERA S.n.c. di Calamunci Daniel & C. | 2026-06-16 | T2 | €30,00 | €2,73 |
| Battistella Fioreria srl | 2026-01-31 | T1 | €25,00 | €2,27 |
| Battistella Fioreria srl | 2026-08-31 | T3 | €138,00 | €12,55 |
| DC STUDIO STP SRL | 2026-03-02 | T1 | €3774,30 | €554,92 |

## Nota per liquidazioni

- La voce più rilevante è **DC Studio STP SRL** (parcella marzo / proforma 158 / fattura n.66): **€554,92** di IVA a credito nel **T1**.
- Se il T1 è già stato liquidato senza questo credito, risulta un **versamento in eccesso** da recuperare nelle liquidazioni successive.
- Credito IVA complessivo di sistema (freeze odierno): vedi `2026-09-21-freeze-risultati.md`.

## Non confondere con

- IVA a debito corrispettivi (LIPE / registro vendite) — fonte gateway, aliquota 10% accessorietà.
- Autofatture TD17 reverse charge — IVA debito = credito, effetto nullo sul risultato.
