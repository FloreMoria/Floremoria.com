# 11-09-2026 — Modello vendite PayPal HAYUM + Stripe

Conto commerciante: **HAYUMYJTWLRTE**. Report in `docs/verbali/paypal-sales-reports/`.

| Trimestre | Vendite | Importo | Stato |
|-----------|--------:|--------:|-------|
| T1 | 10 | €382,39 | definitivo |
| T2 | 8 | €321,85 | definitivo |
| T3 (1 lug – **10 set**) | 14 | €647,74 | **PROVVISORIO** — ricaricare a fine T3 |
| **Totale** | **32** | **€1.351,98** | |

Ripartizione fatturato: PayPal **€1.351,98** + Stripe **€2.746,70** = **€4.098,68**.

---

## 1. Eccesso Stripe €725,67 → doppi PayPal∩Stripe

| | € |
|--|--:|
| Stripe TX pre | 3.472,37 |
| Target | 2.746,70 |
| Eccesso dichiarato | 725,67 |
| **Doppi chiusi (17)** | **712,16** |
| Residuo non abbinato | **13,51** |

Post soft-reverse: Stripe TX = **€2.760,21** (Δ vs target **+€13,51** — dichiarato, non forzato).

Elenco completo in `11-09-2026-paypal-sales-model.json` / apply JSON. Esempi: Mammi 20/05–01/09 €31,48×N, Rampoldi 23/05 €32,48, Puliafico 15/07 €49,99, 24/08 €53,97, 26/08 €52,98.

Batch: `PAYPAL_SALES_MODEL_20260911`.

---

## 2. Fuori gateway → quasi zero

I **13 .eu PayPal** (€545,84) erano già `PAYPAL_TX` (TI post-arch), **non** `MANUAL_INBOUND`. Marcati `paypalSalesReport` + `euPaypalNative`.

| | n | € |
|--|--:|--:|
| MANUAL_INBOUND pre | 31 | 1.474,47 |
| Soft-reverse (coperti PayPal o Stripe) | 27 | 1.330,03 |
| **Residuo fuori gateway** | **4** | **144,44** |

### Residui (unici candidati «davvero fuori»)

| Ordine | Data | € | Buyer |
|--------|------|--:|-------|
| FT-CS-26-005 | 2026-08-17 | 31,48 | Luciano Mammì |
| FT-SA-26-001 | 2026-05-19 | 29,99 | Ester Irace |
| FT-MB-26-001 | 2026-07-20 | 37,99 | Carolina Negrini Bertelli |
| FF-CO-26-001 | 2026-07-21 | 44,98 | Salvatore Marsiglione |

Nessuno ha `stripeTransactionId` / `paymentMethodLabel`.

### Stripe EU ≈ €1.121,18

Lista .eu €1.667,02 − PayPal .eu €545,84 = **€1.121,18** atteso su Stripe EU.

Verifica: 19 abbinamenti lista↔`STRIPE_TX:stripe_eu` = **€1.091,19**; manca **ODUMO5** €29,99 (03/22) → 1.091,19+29,99=**1.121,18**.  
Ledger `STRIPE_TX:stripe_eu` grezzo resta €1.928,98 (orfani .com su chiavi eu — non toccati in questo lotto).

---

## 3. Equazione conto PayPal

| Addendo | € |
|---------|--:|
| Incassi (report) | **+1.351,98** |
| Commissioni (fee sulle TX vendita in ledger) | **−24,75** |
| Spese (SaaS/operative ledger PayPal) | **−2.319,64** |
| Prelievi Fineco (rif. esterno) | **−569,88** |
| **Risultato** | **−1.562,29** |
| Saldo dichiarato | 0,00 |
| **Scarto** | **−1.562,29** |

Prelievi ledger `PAYPAL_PAYOUT` = €566,76 (≈ rif. €569,88, Δ €3,12).  
Le spese ledger eccedono quanto basterebbe a chiudere a zero con soli incassi−fee−prelievi (€782,10). Non forzato. SDD Fineco→PayPal (€1.655,95) restano fuori da questa equazione (non accreditati sul ledger PayPal).

---

## 4. T3 provvisorio

File: `paypal-sales-reports/T3-2026-PROVVISORIO-1lug-10set.csv` + flag in `paypalSalesReports.ts`.

---

## 5. Pay Later 03/05 €53,48

TX `1T757598T7263511M` · Pozzi · in CSV come «Pagamento Express Checkout».  
Perimetro: **incasso normale** (`pay_later_as_normal_receipt` in `paypalClassify.ts`); metadata `payLater: true` sul ledger.

---

## Codice / METODO

- `lib/financial/paypalSalesReports.ts` — carica report esterni
- `scripts/apply-paypal-sales-model.ts` — apply
- `docs/METODO_DOSSIER_FISCALE.md` → **v1.20**
