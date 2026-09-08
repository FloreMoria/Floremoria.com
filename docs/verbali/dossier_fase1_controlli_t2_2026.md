# Verbale — Dossier Fiscale Fase 1: controlli T2 2026

**Generato:** 2026-09-08T13:18:16.874Z
**Spec:** `docs/METODO_DOSSIER_FISCALE.md` §5
**Ambito:** sola verifica — nessun cambiamento a dati o generatore XLSX

## Esito controlli

| ID | Controllo | Misurato | Atteso | Scostamento | Esito |
|----|-----------|----------|--------|-------------|-------|
| C1 | Completezza banca | 19 | 0 | 19 | **FAIL** |
| C2 | Quadratura banca | 387,90 € | 0,00 € | 387,90 € | **FAIL** |
| C3 | Continuità saldo | 0,00 € | 0,00 € | 0,00 € | OK |
| C4 | Incassi e corrispettivi | 1699,90 € | 0,00 € | 1699,90 € | **FAIL** |
| C5 | Coerenza documenti | 18,40 € | 0,00 € | 18,40 € | **FAIL** |
| C6 | Nessuna riga tecnica | 6 | 0 | 6 | **FAIL** |
| C7 | Identificazione fornitori | 12 | 0 | 12 | **FAIL** |
| C8 | Mastri ammessi | 0 | 0 | 0 | OK |
| C9 | Partite di giro | 10 | 0 | 10 | **FAIL** |
| C10 | Doppia gamba transito | 2 | 0 | 2 | **FAIL** |

### Dettaglio

#### C1 — Completezza banca

- Formula: n° estratto conto − n° Prima Nota canale banca
- estratto=72 · PN banca=53

#### C2 — Quadratura banca

- Formula: Σ Prima Nota − (entrate − uscite estratto)
- Σ PN=363.64 · net estratto=-24.26 (E 1291.54 − U 1315.80)

#### C3 — Continuità saldo

- Formula: saldo iniziale + Σ movimenti − saldo finale
- doc=2 Trimestre Fineco 2026.pdf · open=32442.24 · Σ=-24.26 · close=32417.98 · nLinee=72

#### C4 — Incassi e corrispettivi

- Formula: Σ incassi clienti gateway − totale registro corrispettivi
- gateway=1997.24 (Stripe charges/payments 1524.86 + PayPal) · corrispettivi report=297.34 · nCorrispettivi=8

#### C5 — Coerenza documenti

- Formula: Σ(imponibile + IVA) − Σ totali documento
- manual=33 · saas=6 · parti=843.99 · totali=825.59

#### C6 — Nessuna riga tecnica

- Formula: n° righe negative che stornano positiva stesso documento
- negative rilevate=6 · Cursor -17.75; Cursor -17.75; Stripe Payments Europe -3.14; Apple -0.81; Anthropic, PBC -18.00; Anthropic, PBC -18.00 · spese=33

#### C7 — Identificazione fornitori

- Formula: n° documenti senza P.IVA o CF
- esempi: Cursor; Cursor; Stripe Payments Europe; Apple; Anthropic, PBC…

#### C8 — Mastri ammessi

- Formula: n° righe con mastro fuori elenco chiuso §6.1
- tutte le 53 righe PN in elenco chiuso (dopo normalizzazione legacy)

#### C9 — Partite di giro

- Formula: n° movimenti di transito classificati come ricavo o costo
- righe ledger T2 ispezionate=246

#### C10 — Doppia gamba transito

- Formula: per gateway: Σ dare − Σ avere − saldo wallet dichiarato
- FALLITO su entrambi i gateway (atteso in Fase 1: gamba dare mai scritta / saldo PayPal n/d)
  - **STRIPE**: measured=n/d · FAIL — ledger dare−avere=-2995.42 · wallet dich.=n/d · Expired API Key provided: sk_test_*********************************************************************************************TDkPvR
  - **PAYPAL**: measured=-593,01 € · FAIL — ledger dare−avere=-593.01 · wallet dich.=n/d · Ledger transit (10200 - Banca c/o PayPal / 10200 - Conto PayPal) — saldo API PayPal non wireato; baseline solo ledger · FALLITO: saldo wallet PayPal non dichiarato (API non collegata) e/o gamba dare incompleta

## Confronto con baseline dossier agosto

Valori attesi dal file consegnato ad agosto: **C1 = 19** · **C2 = € 387,90** · **C6 = 6** · **C7 = 12** · **C10 fallito su entrambi**.

**Allineato alla baseline agosto** sui controlli chiave.

## File

- `lib/financial/dossierFiscalControls.ts`
- `scripts/dossier-fiscal-controls-t2-2026.ts`
- `docs/verbali/dossier_fase1_controlli_t2_2026.json`
- `docs/METODO_DOSSIER_FISCALE.md` (specifica, committata in questo giro)
