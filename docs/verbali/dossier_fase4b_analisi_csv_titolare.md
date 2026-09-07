# Fase 4b — Analisi CSV titolare (sola lettura)

**Generato:** 2026-09-07T10:44:04.763Z  
**Vincolo:** nessuna scrittura Lotto 4.

---

## 1. Autofatture `-EST` 2026 — numerazione

### Numeri riusati (vizio formale → commercialista)
- **000001-2026-EST** × 2: 2026-01-31 STRIPE PAYMENTS EUROPE LIMITED 2,01 € · 2026-05-31 Stripe Payments Europe Limited 3,83 €

In particolare **000001-2026-EST**: 31/01 Stripe €2,01 **e** 31/05 Stripe (altro importo). Non è un doppione da Lotto 4.

### Serie numerata (documenti con `NNNNNN-2026-EST`)
| Numero | Usi distinti | Dettaglio |
|--------|--------------|-----------|
| 000001-2026-EST | 2 ⚠️ | 2026-01-31 STRIPE PAYMENTS EUROPE LIMITED 2,01 €; 2026-05-31 Stripe Payments Europe Limited 3,83 € |
| 000002-2026-EST | 1 | 2026-01-31 OpenAI Ireland Limited 23,00 € |
| 000003-2026-EST | 1 | 2026-01-31 STRIPE PAYMENTS EUROPE LIMITED 2,70 € |
| 000004-2026-EST | 1 | 2026-02-28 OpenAI Ireland Limited 23,00 € |
| 000005-2026-EST | 1 | 2026-02-28 OpenAI Ireland Limited 31,01 € |
| 000006-2026-EST | 1 | 2026-02-28 STRIPE PAYMENTS EUROPE LIMITED 4,39 € |
| 000007-2026-EST | 1 | 2026-03-31 STRIPE PAYMENTS EUROPE LIMITED 11,88 € |
| 000008-2026-EST | 1 | 2026-04-30 STRIPE PAYMENTS EUROPE LIMITED 6,87 € |

### Buchi progressione 1…8
_Nessun buco_

Molte autofatture Cursor/Apple/Anthropic/Vercel **non hanno** numero `-EST` (solo TD17 generico): fuori serie formale.

---

## 2. Le due righe (~60%)

| Fornitore | Importo | Scritture ledger trovate |
|-----------|---------|--------------------------|
| DC STUDIO STP SRL | €3.774,30 | **4** |
| IRIN S.R.L. | €681,49 | **4** |
| Somma | €4.455,79 | su €7.481,92 |

### DC STUDIO — tutte le scritture
| Data | Importo | sourceType | sourceKey | allegato | desc |
|------|---------|------------|-----------|----------|------|
| 2026-02-27 | -3774,30 € | BANK_LINE | `BANK_LINE:cmt311c5f000sl4041s82u7pg` | no | Ben: Dc Studio Stp Srl Ins: 27/02/2026 19:31:06 da: Internet Iban: It02y0200822900000107305967 Transid: 2602263139617639480320010900it Cau:  |
| 2026-03-02 | -3774,30 € | JSON_ENTRY | `JSON_ENTRY:entry_sdi_cmt2q4dvb0019jl04xfxs7wfj` | no | Fattura report DC STUDIO STP SRL n. 66 |
| 2026-03-02 | -3774,30 € | JSON_ENTRY | `JSON_ENTRY:entry_sdi_cmt2q4dvb0019jl04xfxs7wfj:v1787344281254` | no | Fattura SDI DC STUDIO STP SRL n. 66 |
| 2026-03-02 | -3774,30 € | MANUAL_EXPENSE | `MANUAL_EXPENSE:cmt2q4dvb0019jl04xfxs7wfj` | sì | Fattura n. 66 — Proforma n. 158 del 28/01/2026; Integrazione nr. 14 fatture estere (giu - dic); Versamento Capitale Sociale |

### IRIN — tutte le scritture
| Data | Importo | sourceType | sourceKey | allegato | desc |
|------|---------|------------|-----------|----------|------|
| 2026-02-18 | -681,49 € | JSON_ENTRY | `JSON_ENTRY:entry_sdi_cmt2q4f4s001hjl04altj34en` | no | Fattura report IRIN S.R.L. n. 265 |
| 2026-02-18 | -681,49 € | JSON_ENTRY | `JSON_ENTRY:entry_sdi_cmt2q4f4s001hjl04altj34en:v1787344275290` | no | Fattura SDI IRIN S.R.L. n. 265 |
| 2026-02-18 | -681,49 € | MANUAL_EXPENSE | `MANUAL_EXPENSE:cmt2q4f4s001hjl04altj34en` | sì | Fattura n. 265 — WOSNIC -assistente virtuale IA su website - 12 mesi 558,6+ IVA |
| 2026-02-18 | -681,49 € | PAYPAL_MOVEMENT | `PAYPAL_TX:54W40024GA901774A` | no | Pagamento abbonamento · irin srl · Wosnic 49/mese pagamento annuale |

---

## 3. Per documento (non per coppia)

Documenti (fornitore+n.+data) con ≥2 scritture nel perimetro costi JSON∩MANUAL: **73**  
Con **≥3 scritture**: **53** (excess se si tiene 1: **12.847,18 €**)

### Citati dal titolare (multi-coppia)
| Fornitore | N. | Data | Scritture | Da stornare (→1) | Importo |
|-----------|----|------|-----------|------------------|---------|
| ARUBA SPA | 1000263003864237 | 2026-04-27 | 4 | 3 | 73,19 € |
| ARUBA SPA | 1000261000170337 | 2026-04-30 | 4 | 3 | 61,00 € |
| BALLARATE PIERO SRL | 570 | 2026-05-05 | 4 | 3 | 57,95 € |
| Battistella Fioreria srl | 183 | 2026-05-30 | 4 | 3 | 40,00 € |
| EREDI DI BENDA SERGIO SOCIETA' AGRICOLA | 32 | 2026-04-28 | 4 | 3 | 33,00 € |
| LA PRIMAVERA S.n.c. di Calamunci Daniel & C. | 2026/7 | 2026-06-16 | 4 | 3 | 30,00 € |
| SHOPPINGARDEN DI ANNA BRUNO | 12/2026 | 2026-06-18 | 4 | 3 | 20,00 € |
| SHOPPINGARDEN DI ANNA BRUNO | 7/2026 | 2026-05-21 | 4 | 3 | 20,00 € |
| Battistella Fioreria srl | 136 | 2026-04-30 | 4 | 3 | 20,00 € |
| SHOPPINGARDEN DI ANNA BRUNO | 5/2026 | 2026-04-20 | 4 | 3 | 20,00 € |
| BALLARATE PIERO SRL | 464 | 2026-04-09 | 4 | 3 | 9,13 € |
| ARUBA SPA | 1000263004039573 | 2026-05-03 | 4 | 3 | 6,09 € |
| Battistella Fioreria srl | 96 | 2026-03-31 | 3 | 2 | 145,00 € |
| Battistella Fioreria srl | 235 | 2026-07-31 | 3 | 2 | 140,00 € |
| SHOPPINGARDEN DI ANNA BRUNO | 1/2026 | 2026-01-26 | 3 | 2 | 60,01 € |
| Battistella Fioreria srl | 210 | 2026-06-30 | 3 | 2 | 50,00 € |
| Battistella Fioreria srl | 53 | 2026-02-28 | 3 | 2 | 45,00 € |
| LA PRIMAVERA S.n.c. di Calamunci Daniel & C. | 2026/1 | 2026-01-24 | 3 | 2 | 27,01 € |
| Battistella Fioreria srl | 21 | 2026-01-31 | 3 | 2 | 25,00 € |
| SHOPPINGARDEN DI ANNA BRUNO | 17/2026 | 2026-08-03 | 3 | 2 | 20,00 € |
| SHOPPINGARDEN DI ANNA BRUNO | 19/2026 | 2026-08-19 | 3 | 2 | 20,00 € |
| SHOPPINGARDEN DI ANNA BRUNO | 14/2026 | 2026-07-07 | 3 | 2 | 20,00 € |
| SHOPPINGARDEN DI ANNA BRUNO | 3/2026 | 2026-03-25 | 3 | 2 | 20,00 € |
| SHOPPINGARDEN DI ANNA BRUNO | 2/2026 | 2026-02-23 | 3 | 2 | 20,00 € |
| Battistella Fioreria srl | 253 | 2026-08-31 | 2 | 1 | 138,00 € |
| TORRE DOMENICA | 1 | 2026-06-19 | 2 | 1 | 62,00 € |
| DOMENICA TORRE | 1 | 2026-06-19 | 2 | 1 | 62,00 € |
| DI PAOLA MARIA ANTONIETTA | 16 | 2026-05-26 | 2 | 1 | 40,00 € |
| MARIA ANTONIETTA DI PAOLA | 5 | 2026-02-17 | 2 | 1 | 40,00 € |
| MARIA ANTONIETTA DI PAOLA | 16 | 2026-05-26 | 2 | 1 | 40,00 € |
| CALAMUNCI TINDARO | 2026/9 | 2026-05-06 | 2 | 1 | 25,00 € |
| DI PAOLA MARIA ANTONIETTA | 10 | 2026-04-04 | 2 | 1 | 25,00 € |
| MARIA ANTONIETTA DI PAOLA | 10 | 2026-04-04 | 2 | 1 | 25,00 € |
| TINDARO CALAMUNCI | 2026/9 | 2026-05-06 | 2 | 1 | 25,00 € |
| VIDOZ ALESSIA | 19 | 2026-04-01 | 2 | 1 | 20,00 € |
| CANNONE LUCREZIA | 4 | 2026-04-22 | 2 | 1 | 20,00 € |
| ALESSIA VIDOZ | 19 | 2026-04-01 | 2 | 1 | 20,00 € |
| LUCREZIA CANNONE | 4 | 2026-04-22 | 2 | 1 | 20,00 € |
| SHOPPINGARDEN DI ANNA BRUNO | 20/2026 | 2026-09-03 | 2 | 1 | 20,00 € |

**Regola:** storno “una gamba per coppia” su documenti a 4 scritture lascia **2**, non **1**.

---

## 4. Gruppi rifatti

| Gruppo | Coppie | Euro |
|--------|--------|------|
| G1 GEMELLE PERFETTE | 68 | 6666,80 € |
| SCARTATE_ACCOPPIAMENTO_ERRATO | 10 | 372,01 € |
| G5 AUTOFATTURE ESTERE | 15 | 162,55 € |
| G2 RICORRENTI NOTE | 6 | 280,56 € |

- **G3** = solo banca↔wallet (SDD/giroconti).  
- **G5 AUTOFATTURE** = costi servizi esteri (fuori Lotto 4).  
- Autofatture / fioristi non vanno più in G3.

---

## 5. Accoppiamenti errati (scartare dal lotto)

**10** coppie con fornitore o numero documento diverso (o Fornitore SDI): **372,01 €**  
Incluse Ferrante↔Shoppingarden a €20.

---

## 6. Isabella

### Gateway — è Stripe, non PayPal
I numeri del titolare (€4,52 commissioni / €280,38 saldo) combaciano **al centesimo** con Stripe EU, non con PayPal:

| Voce | Euro | Fonte |
|------|------|-------|
| Charge gross 03/05 | **€284,90** | `txn_3TSzMs…` |
| Fee | **€4,52** | stessa charge |
| Net charge | **€280,38** | stessa charge |
| Payout Stripe 07/05 | **€278,75** | `po_1TUFpV…` / Fineco causale Stripe |
| Δ net−payout | **−€1,63** | trattenuta/netting nel payout Stripe |

Nessun PayPal €284,90/€280,38 nel periodo. Fineco €278,75 è il **payout Stripe** (Citibank), non un accredito PayPal.

### Ordini confermati
- FT-MC-26-004 consegna 2026-05-31 · COMPLETED/PAID
- FT-MC-26-003 consegna 2026-07-04 · COMPLETED/PAID
- FT-MC-26-005 consegna 2026-07-30 · COMPLETED/PAID
- FT-MC-26-006 consegna 2026-09-12 · PENDING/UNPAID

---

## 7. Luciano Mammì — annullati

- **FT-PA-26-002** 31,48 €: ricavi ledger = **0** ✓
- **FT-PA-26-006** 31,48 €: ricavi ledger = **0** ✓

**OK: nessun ricavo ledger attivo sugli ordini ANNULLATI.**

---

## STOP
Nessun Lotto 4. JSON completo: `docs/verbali/dossier_fase4b_analisi_csv_titolare.json`.
