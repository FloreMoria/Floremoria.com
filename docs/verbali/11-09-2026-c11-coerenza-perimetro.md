# Verbale — 11 settembre 2026 — C11 coerenza di perimetro

## Spec
METODO **v1.14** §5: controllo **C11** — `max(Σ) − min(Σ)` sui lordi ricavi da ordine di corrispettivi, ledger ricavi, taxRegister, taxQuarterly, cfoTools. Atteso **0**. Pose escluse con `isPrepaidSubscriptionPoseOrder`. Lordo di confronto canonico (stessa regola di taxRegister) così lo scostamento misura solo il perimetro.

## Implementazione
- `lib/financial/revenuePerimeterChannels.ts` — misura i cinque canali
- `lib/financial/dossierFiscalControls.ts` — `controlC11` + `runAllDossierControls`
- UI badge / XLSX / API: etichette C1–C11 · `DOSSIER_METHOD_VERSION = 1.14`

## Prima misura (sola lettura)

| Trimestre | C11 | Dettaglio sintetico |
|-----------|-----|---------------------|
| T2 2026 | FAIL · Δ €913,69 | taxRegister/taxQuarterly/cfoTools allineati €1.211,03 (n=21); corrispettivi €913,69 (n=13); ledger €297,34 (n=8) |
| T3 2026 | FAIL · Δ €1.124,65 | trio ordini €1.796,94 (n=32); corrispettivi €672,29; ledger €1.761,95 |

I tre canali a `createdAt` (taxRegister / taxQuarterly / cfoTools) **coincidono** dopo il fix pose. Lo scostamento residuo è collegamento gateway incompleto e ledger (documentRef) non ancora allineato all’universo ordini — C11 lo dichiara, non lo nasconde.
