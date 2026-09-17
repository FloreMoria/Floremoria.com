# Verbale — 17-09-2026 · Corrispettivi solo vendite · gate T2

## Contesto
Il MANCANTE non era (solo) aggancio: nel registro entravano cashback/micro-PayPal, gemelle
Stripe `py_`, e `re_` come ricavi. Regola: **solo vendite**.

## Intervento
- `lib/financial/paypalSalesReport.ts` — report HAYUM come fonte autorevole
- `lib/financial/corrispettiviSalesFilter.ts` — filtro §8.4 in `buildGatewayCorrispettivi`
- METODO **1.25** §8.4

## Rimisura MANCANTE

| Trim | Prima | Dopo | Gate 30% | Export |
|------|-------|------|----------|--------|
| T1 | 1,8% | **0%** | PASS | OK |
| T2 | 42,9% | **26,7%** (stima utente 26,0%) | **PASS** | OK `Dossier_…_T2_oggi.xlsx` |
| T3 | 47,7% | **37,3%** | BLOCCA | no |

Elenco residuo: `docs/verbali/17-09-2026-mancante-iva-elenco.json` (25 righe: vendite
reali ancora senza aliquota/ordine, non più rumore cashback).

## Note
- 18 micro-PayPal T2 (€108,22) esclusi come non-vendita
- Gemelle PayPal/Stripe rimosse (vince report)
- `re_` + charge rimborsata (FF-RM-26-001) esclusi dal registro ricavi

**Commit:** `dc2abff0`
