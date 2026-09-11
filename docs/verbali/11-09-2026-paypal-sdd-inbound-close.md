# 11-09-2026 — Close SDD Fineco→PayPal + inbound HAYUM + C11–C13

Batch: `PAYPAL_SDD_INBOUND_20260911`. Artifact: `11-09-2026-paypal-sdd-inbound-close.json`.

---

## 1. SDD Fineco→PayPal €1.655,95

47 movimenti Fineco SDD aggiornati a `TRASFERIMENTO_INTERNO` (dare `10200` PayPal / avere Fineco).  
Non sono ricavi né costi: stessa cassa che si sposta. Nessuna seconda riga `PAYPAL_SDD_FUNDING` (evita doppio conteggio su `sumPaypalPaymentAccountCents`).

## 2. Inbound vendite PayPal (+€670,68)

| | n | € |
|--|--:|--:|
| Report HAYUM (T1+T2+T3 prov.) | **32** | **1.351,98** |
| Checkout TI pre | — | 681,30 |
| Gap chiuso | — | **670,68** |

Azioni: unreverse `stripe_paypal_same_order_dedup` su PAYPAL_TX/FEE del report; flag `paypalSalesReport`; risoluzione slot T3 (24/08, 26/08, 01/09×2, 09/09) a TX reali (`1BM…`, `1AP…`, …). Rumore fuori-report soft-reversed (`9JN…` €31,48; `5S1…` €10).

### Commissioni

| | € |
|--|--:|
| Pre (incomplete) | 27,69 |
| CSV vendite ~ | 47,73 |
| **Ledger post** | **50,67** (29 fee) |

In banda attesa €50–60.

### Riconciliazione conto PayPal

| Addendo | € |
|---------|--:|
| Partenza ~ | −1.990,06 |
| + SDD | +1.655,95 |
| + inbound mancante | +670,68 |
| **Atteso pre fee top-up** | **+336,57** |
| Fee ripristinate (Δ vs 27,69) | −22,98 |
| **Ledger conto PayPal** | **+313,59** |
| Dichiarato | 0,00 |
| **Scarto** | **+313,59** |

Non forzato a zero.

## 3. Stripe → target €2.746,70

| | € |
|--|--:|
| Stripe TX pre (storico) | 3.472,37 |
| Dopo rimozione doppi report | **2.760,21** |
| Target (ufficiale − PayPal) | 2.746,70 |
| Δ residuo | **+13,51** |

17 doppi Stripe∩PayPal (€712,16): verità **PAYPAL** (report); Stripe già soft-reversed.

### 27 doppi Stripe ∩ fuori-gateway (€1.304,03) — caso per caso

Verità gateway (un solo incasso):

| Decisione | n | Logica |
|-----------|--:|--------|
| **PAYPAL** | 15 | Match report HAYUM data/importo → storno `MANUAL_INBOUND` |
| **STRIPE** | 12 | Match `STRIPE_TX` attivo → storno `MANUAL_INBOUND` |

Elenco completo in JSON (`caseByCaseDoubles.stripeFuoriGateway27`). Sintesi:

**→ PAYPAL:** FT-CS-26-001/002/003/004/006, FT-PA-26-003/004/005/007/008, FT-CO-26-004, FF-PA-26-001, FT-ME-26-001, FT-PD-26-001, FT-MB-26-002 (+ in questo batch FT-CS-26-005 eccedenza 17/08, FT-MB-26-001 near).

**→ STRIPE:** FT-RM-26-002, FF-PN-26-001/002/003/004, FT-RC-26-001/002, FF-PD-26-002/003/004, FF-VR-26-001, FT-ME-26-002.

**Residui fuori gateway (2):** FT-SA-26-001 €29,99 · FF-CO-26-001 €44,98.

## 4. Controlli C11 / C12 / C13

Solo questi tre (niente `runAllDossierControls` — C4 STOP aliquote).

| Controllo | Stato | Misura |
|-----------|-------|--------|
| **C11** | **FAIL** | 53 divergenze perimetro (corrispettivi vs taxRegister/cfoTools) |
| **C12** | **FAIL** | 2 date ±48h (Mammi 22/24 Mar: `cmtvn3fp` / `cmtvn3fy`) |
| **C13** | **FAIL** | Stripe transito **−€388,07** vs dich. €100 (Δ −488,07); PayPal **+€313,59** vs €0 |

---

Script: `scripts/apply-paypal-sdd-inbound-close.ts`.
