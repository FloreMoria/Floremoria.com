# 11-09-2026 — Chiusura giornata: payout Fineco, eccesso €848, due RAI, PayPal, RV

## 1. Payout ledger vs Fineco (€219,24)

| Fonte | Importo |
|-------|--------:|
| Ledger pre-chiusura | €3.097,50 |
| Accrediti Fineco Stripe (verità) | **€2.878,26** |
| Δ | €219,24 |

### Movimenti ledger assenti da Fineco (chiusi)

| Data | Importo | ID | Azione |
|------|--------:|----|--------|
| 2026-09-10 | €297,85 | `po_1UDvan4W4pZWhSUsge2pRPub` | Soft-reverse (fantasma — non accreditato) |

### Presenti Fineco / API, assenti o reverseati nel ledger (ripristinati)

| Data | Importo | ID | Azione |
|------|--------:|----|--------|
| 2026-05-28 | €30,87 | `po_1TbsDK4W4pZWhSUsHr2btVRJ` | Un-reverse `STRIPE_PAYOUT:po_*` |
| 2026-07-20 | €47,74 | `po_1Tv5P44W4pZWhSUsbKJdN3rS` | Un-reverse `STRIPE_PAYOUT:po_*` |

Check: 297,85 − 30,87 − 47,74 = **219,24**.

### Equazione post-chiusura (payout = Fineco)

```
TX €3.472,37 − FEE €130,07 − REFUND €139,95 − Fineco payout €2.878,26 = €324,09
```

| Voce | € |
|------|--:|
| Payout ledger post | **2.878,26** (= Fineco) |
| Transito C13 Stripe | 324,09 |
| Dichiarato | 100,00 |
| Δ vs 100 | **+224,09** (non forzato) |

Batch: `PAYOUT_FINECO_CLOSE_20260911`.

---

## 2. Eccesso €848 → residuo €708

| Voce | € |
|------|--:|
| Stripe TX | 3.472,37 |
| Fuori gateway (MANUAL_INBOUND) | 1.474,47 |
| Somma | 4.946,84 |
| Vendite ufficiali | 4.098,68 |
| **Eccesso** | **848,16** |
| Rimborsi Stripe | 139,95 |
| **Residuo** | **708,21** |

### Composizione del residuo €708

| Componente | n | € | Ruolo |
|------------|--:|--:|-------|
| **Doppi operativi** Stripe ∩ fuori-gateway (stesso ordine/importo, orderId non condiviso) | 27 | **+1.304,03** | Contati due volte |
| Stripe senza vendita lista | 2 | **+89,97** | Incasso senza riga ufficiale |
| Lista senza incasso gateway (offset) | 13 | **−545,84** | Vendita senza Stripe/Manual in somma |
| Rimborsi (già tolti dall’848) | — | (−139,95) | |
| **Netto residuo** | | **708,21** | 1.304,03 + 89,97 − 545,84 − 139,95 |

**Nessun doppio per stesso `orderId`.** I 27 sono FT/FF con `MANUAL_INBOUND` + `STRIPE_TX` abbinati per importo/data.

#### Elenco doppi (27)

| Ordine | Manual € | Stripe € | Data Stripe | Stripe key |
|--------|--------:|--------:|-------------|------------|
| FT-CS-26-001 | 31,48 | 31,48 | 2026-05-20 | `stripe_tx_txn_3TZBBT4W4pZWhSUs19WmIUfU` |
| FT-PA-26-003 | 31,48 | 31,48 | 2026-05-20 | `stripe_tx_txn_3TZBFq4W4pZWhSUs1kRE0CNZ` |
| FT-CO-26-004 | 32,48 | 32,48 | 2026-05-23 | `stripe_tx_txn_3TaBEw4W4pZWhSUs12Q2pKyE` |
| FT-SA-26-001 | 29,99 | 29,99 | 2026-05-11 | `stripe_tx_txn_3TVvy64W4pZWhSUs0pnQ5h0r` |
| FT-RC-26-001 | 43,97 | 43,97 | 2026-06-13 | `stripe_tx_txn_3ThmH14W4pZWhSUs14CAHHaS` |
| FT-PA-26-004 | 31,48 | 31,48 | 2026-06-17 | `txn_3TjJBK4W4pZWhSUs1SYv8DdG` |
| FT-CS-26-002 | 31,48 | 31,48 | 2026-06-17 | `txn_3TjJKX4W4pZWhSUs0oQvh7vx` |
| FF-VR-26-001 | 64,98 | 64,98 | 2026-06-22 | `stripe_tx_txn_3Tl97E4W4pZWhSUs1948B9mT` |
| FF-PD-26-002 | 104,98 | 104,98 | 2026-07-02 | `stripe_eu_tx_txn_3TonoCRrkwwcYwep1GA8NIWP` |
| FF-PD-26-003 | 69,99 | 69,99 | 2026-07-03 | `stripe_eu_tx_txn_3Tp8tnRrkwwcYwep0biMYl7Q` |
| FT-CS-26-003 | 31,48 | 31,48 | 2026-07-04 | `stripe_tx_txn_3TpPFc4W4pZWhSUs0a5P7iqY` |
| FT-PA-26-005 | 31,48 | 31,48 | 2026-07-04 | `txn_3TpPJU4W4pZWhSUs1xG9UPO0` |
| FF-PA-26-001 | 144,98 | 144,98 | 2026-07-04 | `stripe_tx_txn_3TpOrX4W4pZWhSUs03In3uTa` |
| FF-PD-26-004 | 39,99 | 39,99 | 2026-07-09 | `stripe_eu_tx_txn_3TrNudRrkwwcYwep0zY0M7LI` |
| FT-ME-26-001 | 49,99 | 49,99 | 2026-07-15 | `stripe_tx_txn_3TtPv84W4pZWhSUs0Fb7Bd2I` |
| FT-PD-26-001 | 37,99 | 37,99 | 2026-07-16 | `stripe_eu_tx_txn_3TtjecRrkwwcYwep1EDBi6dh` |
| FT-CS-26-004 | 31,48 | 31,48 | 2026-07-30 | `txn_3TyuIF4W4pZWhSUs0hkSIqAs` |
| FT-PA-26-007 | 31,48 | 31,48 | 2026-07-30 | `stripe_tx_txn_3TyuTV4W4pZWhSUs0M1W5j6g` |
| FT-RC-26-002 | 29,99 | 29,99 | 2026-08-01 | `stripe_eu_tx_txn_3TzcRERrkwwcYwep0NIP8g6r` |
| FT-ME-26-002 | 47,46 | 47,46 | 2026-08-04 | `txn_3U0cT94W4pZWhSUs0qUXOKG7` |
| FF-PN-26-003 | 39,99 | 39,99 | 2026-08-06 | `stripe_eu_tx_txn_3U1Yc8RrkwwcYwep1l4tJnL9` |
| FF-PN-26-002 | 69,99 | 69,99 | 2026-08-10 | `stripe_eu_tx_txn_3U2vU2RrkwwcYwep06Fy5g4j` |
| FT-RM-26-002 | 52,48 | 52,48 | 2026-08-13 | `txn_3U44XP4W4pZWhSUs0Ikhhvek` |
| FT-PA-26-008 | 31,48 | 31,48 | 2026-08-17 | `txn_3U5QyD4W4pZWhSUs13SNdOmE` |
| FT-CS-26-006 | 31,48 | 31,48 | 2026-08-17 | `stripe_tx_txn_3U5R2d4W4pZWhSUs0z67gjHy` |
| FF-PN-26-001 | 39,99 | 39,99 | 2026-08-17 | `stripe_eu_tx_txn_3U5RyERrkwwcYwep0qd5uTzR` |
| FF-PN-26-004 | 89,99 | 89,99 | 2026-08-21 | `stripe_eu_tx_txn_3U6no5RrkwwcYwep0uomtdte` |

#### Stripe senza vendita lista (2)

| Data | € | Key |
|------|--:|-----|
| 2026-05-19 | 34,99 | `STRIPE_TX:txn_3TYqjZ4W4pZWhSUs1SlZrQ1q` |
| 2026-05-30 | 54,98 | `STRIPE_TX:txn_3TcirV4W4pZWhSUs05MMgxPE` |

JSON: `docs/verbali/11-09-2026-day-close-848-paypal-rai.json`.

---

## 3. CCIAA e due RAI distinti

Contributo **€4.597,66** già in CE come `CONTRIBUTI_ESERCIZIO` (non vendite).

| Vista | € | Definizione |
|-------|--:|-------------|
| **Risultato gestione** | **−8.450,18** | RAI − contributo |
| Contributo CCIAA | +4.597,66 | Bando Nuova Impresa 2025 |
| **Risultato d’esercizio** | **−3.852,52** | RAI con contributo |

UI: Archivio fiscale storico — card + banner a tre colonne; mission-control espone entrambi i campi.

### RAI aggiornato a oggi (post correzioni giornata)

| Voce PnL | € |
|----------|--:|
| Vendite caratteristiche (PnL) | 3.665,31 |
| Altri ricavi | 32,81 |
| Contributi | 4.597,66 |
| **Risultato gestione** | **−8.450,18** |
| **Risultato d’esercizio (RAI)** | **−3.852,52** |

(Δ vs freeze post-L6 −€3.764,48: cleanup rumore RV della giornata ≈ −€88.)

---

## 4. Conto PayPal −€1.990,06 vs saldo dichiarato €0

Composizione ledger (somma = scarto):

| Voce | n | € |
|------|--:|--:|
| Spese (SaaS / operative / fioristi) | 72 | **−2.319,64** |
| Fee PayPal | 16 | **−27,69** |
| Prelievi → Fineco | 25 | **−566,76** |
| Rimborsi / sblocchi | 11 | +43,32 |
| Accrediti residui (cashback, altri) | 25 | +199,41 |
| TI residui (ex Express Checkout riclassificati) | 17 | +681,30 |
| **Saldo ledger** | | **−1.990,06** |

**Addebiti SDD Fineco→PayPal:** €1.655,95 (47 mov.) sul lato Fineco; **0 accrediti SDD** sul conto PayPal in ledger. Se si aggiungessero, residuo ≈ −€334 (non ancora scritto — sola diagnosi).

Non è più ciclo vendite: non blocca C13 Stripe. Va trattato come c/c da quadrare.

---

## 5. Rumore RICAVI_VENDITE

Già eseguito (`RV_NOISE_CLEANUP_20260911` / verbale `11-09-2026-rv-noise-cleanup.md`):

| Azione | Effetto |
|--------|---------|
| Ballarate / Poste / Orchidea / Maspes / Ubigi / cashback | **0 residui in RV** |
| Negativi storici −€2.693,19 | già fuori RV |
| Vendite PnL post | €3.665,31 |
| RAI esercizio post | −€3.852,52 |

Raw `RICAVI_VENDITE` positivi ancora ≈ €5.084 (Stripe+Manual) — eccedenza vs ufficiale = tema punto 2 (doppi), non rumore nominale.

---

## Artefatti / codice

- `scripts/apply-close-payout-fineco-delta.ts` + un-reverse forzato dei due `po_*`
- `scripts/_diag-day-close-848-paypal-rai.ts`
- UI dual-RAI: `HistoricalFiscalArchivePanel.tsx`, `mission-control/route.ts`
