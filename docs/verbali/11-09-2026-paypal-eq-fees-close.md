# 11-09-2026 — Equazione PayPal (SDD+fee) · FT-MB ±1g · stripe_eu orfani · C11–C13

Batch: `PAYPAL_EQ_FEES_CLOSE_20260911`. Apply: **true**.

## 1. SDD Fineco→PayPal €1655,95

Già in ledger (47 TI, dare PayPal / avere Fineco, batch `PAYPAL_SDD_INBOUND_20260911`).

| Equazione pulita (vendite report) | € |
|---|--:|
| Incassi HAYUM | +1.351,98 |
| Commissioni (pre, incomplete) | −24,75 |
| Spese ledger | −2.319,64 |
| Prelievi Fineco (rif.) | −569,88 |
| **Prima SDD** | **−1.562,29** |
| + SDD | +1655,95 |
| **Dopo SDD (fee @24,75)** | **+93,66** (atteso +93,66) |
| Commissioni post ripristino | −57,84 |
| **Dopo SDD (fee post)** | **+60,57** |
| Ledger conto PayPal (C13) | **+306,42** |
| Dichiarato | 0,00 |

Il ledger è più alto dell’equazione pulita per cashback/refund SaaS e `PAYPAL_REFUND` (non forzato).

## 2. Commissioni

4 `PAYPAL_FEE` del report erano ancora reversed (`stripe_paypal_same_order_dedup`). Ripristinate: **+€7.17**.

| | € |
|--|--:|
| CSV Tariffa su vendite | 47,73 |
| Ledger fee post | **57,84** |
| Banda attesa | 55–60 |
| In banda | sì |

Residuo equazione @24,75 ≈ €94: le fee mancanti erano qui (parziale vs zero completo).

## 3. FT-MB-26-001 (Carolina Negrini, €37,99)

Verità **PAYPAL** `0CW42027YJ1249932` del **19/07** (payer Andrea Varesi; ordine **20/07**). Tolleranza **±1 giorno**.

`FT-PD-26-001` Filomena Maiorano stesso importo → **Stripe EU** `stripe_eu_tx_txn_3Ttjec…` del 16/07 (non PayPal).

Residui MANUAL ancora aperti: vedi JSON `residualManualsPm1` (FT-SA, FF-CO).

## 4. FT-CS-26-005 €31,48 del 17/08

Tre ordini Mammì €31,48 quel giorno; PayPal ne ha **due**; Stripe ne aveva due (già stornati come doppi).

**Decisione: DUPLICATO_SENZA_INCASSO** — FT-CS-26-005 (13:20) è il terzo checkout senza gamba di pagamento. Non pagato altrove.

## 5. stripe_eu grezzo €1928,98 vs €1.121,18

Orfani **€807,80** = 10 righe **.com su chiavi eu** (somma €807,80):

| Ordine | € | Chiave |
|--------|--:|--------|
| FT-MC-26-007 | 284,90 | `…txn_3TSzMsRrkwwcYwep11EAvI3P` |
| FF-PD-26-002 | 104,98 | `…txn_3TonoCRrkwwcYwep1GA8NIWP` |
| FF-PD-26-003 | 69,99 | `…txn_3Tp8tnRrkwwcYwep0biMYl7Q` |
| FF-PD-26-004 | 39,99 | `…txn_3TrNudRrkwwcYwep0zY0M7LI` |
| FT-PD-26-001 | 37,99 | `…txn_3TtjecRrkwwcYwep1EDBi6dh` |
| FT-RC-26-002 | 29,99 | `…txn_3TzcRERrkwwcYwep0NIP8g6r` |
| FF-PN-26-001 | 39,99 | `…txn_3U1Yc8RrkwwcYwep1l4tJnL9` |
| FF-PN-26-002 | 69,99 | `…txn_3U2vU2RrkwwcYwep06Fy5g4j` |
| FF-PN-26-003 | 39,99 | `…txn_3U5RyERrkwwcYwep0qd5uTzR` |
| FF-PN-26-004 | 89,99 | `…txn_3U6no5RrkwwcYwep0uomtdte` |

Non bloccano il modello; solo census + tag metadata.

## 6. C11 / C12 / C13

| Controllo | Stato | Nota |
|-----------|-------|------|
| **C11** | FAIL | Δ=53 · n canali: Corrispettivi=45 · Ledger ricavi=25 · taxRegister=75 · taxQuarterly=75 · cfoTools=75 · divergenti=53 · FT-SA-2 |
| **C12** | FAIL | Δ=2 · universo corrispettivi=45 · verificati=45 · esclusi_non_risolvibili=0 · tolleranza fuso=24h · divergenze=2 · cmtvn3fp or |
| **C13** | FAIL | STRIPE(transito vendite): ledger=-388.07 · dich.=100.00 · Δ=-488.07 · PAYPAL(conto pagamento): ledger=306.42 · dich.=0.00 · Δ=306.42 |

---

Artifact: `11-09-2026-paypal-eq-fees-close.json`.
