# Fase 4b — Propedeutico Lotto 3 (sola lettura)

**Data:** 2026-09-06  
**Contesto:** post Lotto 2 (`FASE4B_L2_20260906_205447`)  
**Modalità:** ZERO scritture

---

## Target payout (87 righe · €4.080,29)

Criterio: `BANK_LINE` in categorie ricavo + `dryRunClassifyBankLine` → `PAYOUT_MATCHED`.

| Categoria attuale | Righe | Importo | Di cui sopravvivono alla gerarchia fiscale |
|-------------------|-------|---------|--------------------------------------------|
| **`RICAVI_VENDITE`** | **66** | **€3.063,69** | 64 · **€3.007,80** (2 · €55,89 già soppresse) |
| **`ALTRI_RICAVI`** | **21** | **€1.016,60** | **0 · €0,00** (tutte già fuori dal PnL per gerarchia) |
| Totale | **87** | **€4.080,29** | — |

---

## Effetto meccanico sul PnL `.com` DOPO Lotto 3 (NON «vendite reali»)

| Scenario | Valore |
|----------|--------|
| `RICAVI_VENDITE` motore PnL oggi (post L2) | €5.736,32 |
| − payout `RICAVI_VENDITE` ancora in gerarchia | −€3.007,80 |
| **Saldo meccanico post-Lotto 3** | **≈ €2.728** |

**VIETATO** scrivere nei verbali «vendite reali = €2.6xx».  
Quel numero ignora Stripe EU (€3.732), PayPal EU (non misurato in Neon), e non è il fatturato societario.  
Vedi `dossier_fase4b_correzione_sdd_vendite.md`.

I €1.016,60 in `ALTRI_RICAVI` (21 payout) vanno comunque a transito per pulizia registro; già fuori dal PnL vendite per gerarchia.

---

## STOP

Nessuna esecuzione Lotto 3 in questa sessione.  
Lotto 3 **può** procedere con via libera esplicita; nel report post-esecuzione non dichiarare vendite reali.
