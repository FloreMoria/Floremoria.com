# Fase 4b — Lotto 2 ESEGUITO (Contributo CCIAA)

**Data esecuzione:** 2026-09-06  
**batch_id:** `FASE4B_L2_20260906_205447`  
**Azione:** riclassifica (NON storno)  
**Righe toccate:** 1

---

## Scrittura

| Campo | Valore |
|-------|--------|
| **ID** | `cmt3zx44k00e9ky04exlfxeyg` |
| **Importo** | €4.597,66 |
| **Da** | `ALTRI_RICAVI` · Avere `60100 - Ricavi da Vendite` |
| **A** | `CONTRIBUTI_ESERCIZIO` · Avere `65000 - Contributi in conto esercizio` |
| **fase4bAction** | `RECLASS` |
| **Eseguito alle** | `2026-09-06T20:54:49.404Z` |

Rollback: ripristinare `category=ALTRI_RICAVI` + metadata precedente per lo stesso `fase4bBatchId`; cold backup `backup-pre-fase4b-20260906`.

---

## Quattro valori post-esecuzione (motore PnL)

Misura: `computeHistoricalPnl({ fiscalYear: 2026 })` **immediatamente dopo** la write.

| Metrica | Pre-L2 (stesso istante) | Post-L2 | Delta Lotto 2 |
|---------|-------------------------|---------|---------------|
| **Vendite caratteristiche** | €5.736,32 | **€5.736,32** | **€0,00** |
| **Altri ricavi** | €4.819,22 | **€221,56** | **−€4.597,66** |
| **Contributi in conto esercizio** | €0,00 | **€4.597,66** | **+€4.597,66** |
| **Risultato ante imposte 2026** | −€2.684,71 | **−€2.684,71** | **€0,00 (INVARIATO)** |

Ricavi lordi totali: €10.800,25 invariati (i contributi restano nel CE).

### Precisazione vs freeze Lotto 0 (−€2.184,71 / vendite €5.932,14)

- **Lotto 2 non ha spostato RAI né vendite** rispetto al pre-write.
- Il RAI assoluto (−€2.684,71) differisce dal freeze di **esattamente €500,00** per una riga **esterna** creata **dopo** il freeze (`2026-09-06T20:46:49Z`): bonifico Fineco → PayPal €500 classificato (erroneamente) come `SPESE_OPERATIVE`. Natura dichiarata dal socio: **giroconto di finanziamento wallet**, non costo. Vedi aggiornamento basi.
- Il numero **€5.932,14** del Lotto 1 rilavorato era somma `RICAVI_VENDITE` post-gerarchia **senza** filtro pose prepagate del motore PnL. Il campo ufficiale motore è **€5.736,32** (invariato pre/post L2). Delta metodologico ≈ €195,82 — non effetto Lotto 2.

---

## Codice allineato

- Categoria `CONTRIBUTI_ESERCIZIO` in `LEDGER_CATEGORIES`
- Conto `65000 - Contributi in conto esercizio`
- PnL espone `venditeCaratteristicheCents` / `altriRicaviCents` / `contributiEsercizioCents` / `rimborsiInRicaviCents`
- Script: `scripts/fase4b-lotto2-execute.ts`

---

## STOP

Lotto 2 chiuso. Attendo via libera al **dry-run Lotto 3** (payout).  
Propedeutico payout: `docs/verbali/dossier_fase4b_lotto3_propedeutico.md`.
