# Fase 4b — Lotto 0: riconciliazione basi (sola lettura)

**Data:** 2026-09-06  
**Stato:** PRE-ESECUZIONE — nessuna scrittura sul ledger di produzione.

## Backup Neon (obbligatorio)

| Campo | Valore |
|-------|--------|
| Project | `proud-water-51827880` (`neon-emerald-car`) |
| Branch backup | **`backup-pre-fase4b-20260906`** |
| Branch id | `br-holy-pine-alkquqzg` |
| Parent | `main` (`br-soft-resonance-aldq76cc`) |
| Endpoint | `ep-cold-darkness-alfdeikz` |
| Creato | 2026-09-06T20:31:40Z |

Rollback: ripristinare workload su `main` oppure promuovere/ripristinare dati dal branch backup (snapshot punto-nel-tempo pre-Fase 4b).

## Convenzione `batch_id` (lotti successivi)

Ogni scrittura Fase 4b porterà in `metadataJson`:

```text
fase4bBatchId: FASE4B_L{N}_{YYYYMMDD}_{HHMMSS}
fase4bLotto: N
fase4bAction: RECLASS | REVERSE | PAIR_REVERSE
```

Rollback di lotto: soft-reverse / annullamento di tutte le entry con lo stesso `fase4bBatchId`.

| Lotto | batch_id (da assegnare all’esecuzione) |
|-------|----------------------------------------|
| 1 Patrimoniali | `FASE4B_L1_<ts>` — TBD all’esecuzione |
| 2 CCIAA | `FASE4B_L2_<ts>` — TBD |
| 3 Payout | `FASE4B_L3_<ts>` — TBD |
| 4 Costi duplicati | `FASE4B_L4_<ts>` — TBD |
| 5 PayPal (no write) | n/a |

## Spiegazione delta ~€357 (Fase 3 vs Fase 4a)

| Metrica | Fase 3 / invarianti | Fase 4a dossier | Delta |
|---------|---------------------|-----------------|-------|
| Ricavi | €10.800,25 | €10.800,25 | €0 |
| Costi | **€12.984,96** | **€12.628,22** | **€356,74** |
| Risultato | **−€2.184,71** | **−€1.827,97** (EBITDA) | **€356,74** |

### Causa (dichiarata)

**Non** è quarantena (N=0), **non** è filtro anno, **non** sono righe reversed aggiuntive.

È **perimetro costi diverso**:

- **Fase 3 / acceptance:** costi = produzione + SaaS + operativi + **oneri bancari**  
  `€3.999,37 + €1.065,10 + €7.563,75 + €356,74 = €12.984,96`
- **Fase 4a dossier:** costi = produzione + SaaS + operativi (**senza** oneri)  
  `= €12.628,22`
- **EBITDA** in motore PnL = ricavi − (prod+saas+op) = **−€1.827,97**
- **Risultato ante imposte** = EBITDA − oneri = **−€2.184,71**

Identità: `€12.984,96 − €12.628,22 = €356,74 = oneriBancariCents`.

## BASE UFFICIALE DICHIARATA (unica) — pre-Fase 4b

Fonte: `computeHistoricalPnl({ fiscalYear: 2026 })` su Neon `main`, 2026-09-06.

| Voce | Centesimi | Euro |
|------|-----------|------|
| Ricavi lordi | 1.080.025 | **€10.800,25** |
| Costi produzione (fioristi+SDI) | 399.937 | €3.999,37 |
| Costi SaaS | 106.510 | €1.065,10 |
| Costi operativi | 756.375 | €7.563,75 |
| Oneri bancari | 35.674 | €356,74 |
| **Costi totali (perimetro Fase 3)** | **1.298.496** | **€12.984,96** |
| EBITDA (senza oneri) | −182.797 | −€1.827,97 |
| **Risultato ante imposte** | **−218.471** | **−€2.184,71** |
| IVA debito | 13.497 | €134,97 |
| IVA credito | 30.298 | €302,98 |
| Entry attive / reversed | 874 / 292 | — |
| Quarantena documenti | 0 | — |

**Definizione operativa per tutta la Fase 4b:**

- “Costi” = produzione + SaaS + operativi + oneri bancari (**€12.984,96**)
- “Risultato” = risultato ante imposte (**−€2.184,71**)
- “EBITDA” solo se esplicitamente nominato (−€1.827,97)

## Gate

Non si avvia Lotto 1 (né dry-run esecutivo con scrittura) finché questa base non è **confermata** esplicitamente.

Prossimo passo richiesto: conferma utente → dry-run Lotto 1 → conferma → esecuzione Lotto 1.
