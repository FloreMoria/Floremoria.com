# Verbale 11-09-2026 — Fatturato €4.098,68 · payout · inbound 75 · C13

**Fonte commerciale:** `docs/verbali/FloreMoria_Ordini_Operativi.csv`  
**METODO:** v1.18

---

## Fatturato ufficiale (chiuso)

| | |
|--|--|
| Ordini attivi | **75** (T1 21 · T2 21 · T3 33) |
| Lordo | **€4.098,68** (T1 €1.038,23 · T2 €1.211,03 · T3 €1.849,42) |
| .eu storico | €1.667,02 |
| .com nativo | €2.431,66 |
| Esclusi | 4 pose €0 (carnet Isabella); 0 annullati / 0 test nel CSV pulito |

**€4.587,01** — stima manuale in `09-09-2026-collegamento-incassi-ordini.md` → **dismessa**.  
Costante codice: `lib/financial/officialRevenue2026.ts`.

### 74 → 75
`taxRegister` / perimetro escludevano `FT-RM-26-002` (€52,48, status `DELIVERED_UNPAID`).  
Ora `DELIVERED_UNPAID` è tra gli status ricavi → **75/75**.

---

## 1–2. Payout verso Fineco

### Prima (gonfiato)
| Gateway | n | € |
|---------|---|---|
| Stripe | 83 | 5.160,16 |
| PayPal | 38 | 1.086,03 |
| **Totale** | | **6.246,19** (> €3.900 → duplicati) |

### Dopo dedup
| Gateway | n | € |
|---------|---|---|
| Stripe (`po_*` only) | 45 | **3.097,50** |
| PayPal (solo «Prelievo generico») | 25 | **566,76** |
| **Totale transito** | | **3.664,26** |

### Duplicati trovati e stornati
| Tipo | n | Natura |
|------|---|--------|
| `txn_*` / `stripe_tx_txn_*` speculari a `po_*` | 27 | stessa API Stripe: balance_transaction del payout vs id `po_` |
| `stripe_tx_po_*` (prefisso non canonico) | ~10+ | stesso `po_` scritto due volte |
| PayPal «Trasferimento…Ordine FloreMoria» | 13 | **non** sono bonifici Fineco (mal classati come PAYOUT) |

Codice: `buildStripeTransitCandidates` scrive **solo** `STRIPE_PAYOUT:po_*`.

### vs Fineco (dato esterno)
| | € |
|--|--|
| Accrediti Ord: Stripe su estratto | 2.878,26 |
| Accrediti Ord: PayPal | 569,88 |
| **Totale Fineco** | **3.448,14** |
| Transito payout dopo fix | 3.664,26 |
| **Δ transito − Fineco** | **+216,12** |

Il totale atteso dall’equazione (3.820,19) resta sopra Fineco: o payout gateway non ancora in estratto, o equazione che assume wallet di partenza €0 e fee nette. **Decide Fineco** per i bonifici arrivati; il residuo €216 va riconciliato riga per riga (prossimo giro).

---

## 3. Inbound 75/75

Tutti i 75 ordini attivi hanno gamba di entrata (`STRIPE_TX` / `PAYPAL_TX` / `MANUAL_INBOUND` con `paymentStatus=DA_IDENTIFICARE` dove manca il TX).  
Codici corti CSV (.eu) risolti via suffisso `order.id`.

---

## 4. C13 dopo correzioni

Saldi dichiarati: Stripe **€100** · PayPal **€0**.

| Gateway | Ledger | Dichiarato | Δ |
|---------|--------|------------|---|
| Stripe | €3.928,69 | €100 | **+3.828,69** |
| PayPal | −€1.504,72 | €0 | **−1.504,72** |

**Scarto ≫ €50.** Provenienza:

- **Stripe (+):** flusso 2026 ancora +€2.204 (TX+MANUAL_INBOUND+JSON_ENTRY − fee − payout − refund); stock all-time include JSON legacy (+€625). Non è un buco di entrata sui 75 — è payout/storico/JSON non allineati al cruscotto.
- **PayPal (−):** `PAYPAL_TX` 2026 **netto −€954** (uscite SaaS/carte classate come TX) + payout −€567. La gamba «incasso cliente» PayPal è contaminata da uscite.

C13 è verificabile (saldi dichiarati presenti) ma **rosso**. Prossimo lavoro: separare SaaS da `PAYPAL_TX` e chiudere il Δ Fineco €216.

---

## Equazione di controllo

```
4.098,68 − 178,49 − 3.820,19 = 100,00   (attesa)
4.098,68 − 178,49 − 3.664,26 = 255,93   (con payout ledger post-dedup)
4.098,68 − 178,49 − 3.448,14 = 472,05   (con solo Fineco)
```

---

## Progressione (fuori contabilità)

T1 €1.038 → T2 €1.211 → T3 €1.849 (trimestre aperto): ~+50% a trimestre.
