# Verbale — Dossier Fiscale Fase 2 (METODO v1.2)

**Generato:** 2026-09-08T14:07:47.781Z
**Spec:** `docs/METODO_DOSSIER_FISCALE.md` v1.2 — §4 Quadratura · §6.4 · §9 Eccezioni

## Verifica §6.4 (gate di chiusura)

| | Valore |
|---|---|
| Imponibile Acquisti T2 | **€ 855,53** |
| Atteso | € 855,53 |
| Pre-§6.4 (cancellazione coppie) | € 780,08 |
| Eccezioni «documento già acquisito da altro canale» | **6** |
| Esito | **PASS** |

## Fogli aggiunti

- **Quadratura** (foglio 0): esito controlli, liquidazione IVA §4.2, raccordo finanziario, CE parziale, tracciabilità §12
- **Eccezioni** (ultimo foglio): sempre presente; include le 6 doppie ingestioni §6.4 + controlli falliti
- **Acquisti**: ridenominato; una sola riga per documento estero (sopravvive il canale saas / forma positiva + IVA RC)

## File

- `docs/verbali/Dossier_Fiscale_FloreMoria_2026_T2_v1.2_fase2.xlsx`
- `lib/financial/dossierAcquistiBuild.ts`
- `lib/financial/taxQuarterlyXlsx.ts`

**Fase 2 chiusa.** Prossimo: Fase 3 — Registro corrispettivi (§8), su OK.
