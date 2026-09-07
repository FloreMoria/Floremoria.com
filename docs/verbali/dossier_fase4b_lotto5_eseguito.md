# Fase 4b — Lotto 5 ESEGUITO (SDD → transito)

**Eseguito:** 2026-09-07T13:16:51.891Z  
**batch_id:** `FASE4B_L5_20260907_131645`  
**Righe riclassificate:** 14 · impatto CE **1114,03 €**

---

## Acceptance

| | Atteso | Ottenuto |
|--|--------|----------|
| RAI pre | -5418,51 € | -5418,51 € |
| RAI post | -4304,48 € | -4304,48 € |
| Δ RAI | +1114,03 € | 1114,03 € |
| Banca | invariata | OK 32.006,13 € |
| IVA D/C | tipicamente invariata | 134,97 € / 276,84 € |

---

## Snapshot PRIMA / DOPO

| Metrica | PRE | POST | Δ |
|---------|-----|------|---|
| RAI | -5418,51 € | -4304,48 € | 1114,03 € |
| Costi tot | 13.210,96 € | 12.096,93 € | -1114,03 € |
| Banca cash PnL | 32.006,13 € | 32.006,13 € | 0,00 € |
| IVA debito | 134,97 € | 134,97 € | — |
| IVA credito | 276,84 € | 276,84 € | — |
| Scritture attive | 705 | 705 | 0 |
| Vendite caratt. | 2919,99 € | 2919,99 € | — |
| Transito Stripe | -2995,42 € | -2995,42 € | 0,00 € |
| **Transito PayPal** | **-2207,04 €** | **-1093,01 €** | **1114,03 €** |

Storico gap PayPal dichiarato: −€1.568,30. Nuovo saldo ledger transito PayPal: **-1093,01 €** (prova tre gambe).

---

## Azione

`category` → `TRASFERIMENTO_INTERNO` + `entryNature=TRANSITO`  
Dare `10200 - Banca c/o PayPal` / Avere `10100 - Banca Fineco`  
Metadata: `fase4bLotto=5` / `fase4bAction=RECLASS_SDD_TO_TRANSIT`
