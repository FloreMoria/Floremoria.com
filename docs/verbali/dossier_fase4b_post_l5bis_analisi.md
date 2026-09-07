# Analisi post Lotto 5 / 5-bis (sola lettura salvo L5-bis già eseguito)

**Generato:** 2026-09-07T13:40:00Z  
**Freeze live post-L5bis:** RAI **−€3.804,48** · costi **€11.596,93** · banca **€32.006,13** · PayPal transit **−€593,01** · Stripe transit **−€2.995,42**

---

## 1) Lotto 5-bis — ESEGUITO

**batch_id:** `FASE4B_L5BIS_20260907_133232`  
Target: funding Fineco→PayPal €500 (`SPESE_OPERATIVE` → `TRASFERIMENTO_INTERNO`)

| | PRE | POST | Δ |
|--|-----|------|---|
| RAI | −€4.304,48 | **−€3.804,48** | **+€500,00** |
| Costi | €12.096,93 | €11.596,93 | −€500,00 |
| Banca | €32.006,13 | €32.006,13 | 0 |
| PayPal transit | −€1.093,01 | **−€593,01** | **+€500,00** |
| Stripe transit | −€2.995,42 | −€2.995,42 | 0 |

Acceptance: RAI / banca / PayPal **OK**.

---

## 2) Transito come rilevatore

Squilibrio post-L5bis: |Stripe| + |PayPal| = **€2.995,42 + €593,01 = €3.588,43**  
(prima del 5-bis era €4.088,43; −€500 sul PayPal).

### Scomposizione

| Quota | Euro | Natura |
|-------|------|--------|
| A) Ordini **.eu** non a libro | **€1.667,02** | ricavi mancanti (CE + patrimonio) |
| B) Commissioni Stripe uniche (dedup `txn_` / `stripe_tx_`) | **€86,42** | wallet accredita il netto |
| C) Residuo patrimoniale | **≈ €1.835** | incassi .com già (o non) a CE **senza dare** sul wallet + asimmetria payout L3 |
| **Check** | **≈ €3.588** | |

### Lettura Stripe (metadata dare/avere 10300)

| | Euro |
|--|------|
| Dare (accrediti wallet) | €624,83 — quasi tutti `JSON_ENTRY` legacy |
| Avere (addebiti) | €3.571,62 — di cui **BANK_LINE payout €3.441,55** + fee Stripe |
| Netto ledger | ≈ −€2.947 (allineato al badge −€2.995) |

**Conclusione:** dopo Lotto 3 i payout addebitano il conto di transito, ma gli **incassi clienti non lo hanno mai accreditato** in modo sistematico. Lo squilibrio è la misura più diretta dei ricavi/flussi non modellati a tre gambe — di cui €1.667 .eu sono la parte “non a libro” già quantificata; il resto (~€1.835) è soprattutto **.com senza dare transit** (non un secondo buco di CE della stessa natura).

---

## 3) Buoni e sconti — design (non implementato)

### Modello Order oggi

| Campo | Ruolo |
|-------|--------|
| `totalPriceCents` | totale ordine (oggi usato come listino/ricavo) |
| `grossAmount` / `netAmount` / `stripeFee` | snapshot gateway (Float?, spesso null) |
| `offerRedemptions` → `Offer` | buoni (`type` + `value`) |
| — | **mancano** `discountCents` e `amountPaidCents` espliciti |

Redemption 2026 con `usedAt`: **0** in DB (i buoni non risultano tracciati sulle ordini 2026 via OfferRedemption).  
Ordini paid con `grossAmount ≠ totalPriceCents`: **0** (gross spesso null).

### Disegno proposto

```text
listPriceCents     = listino
discountCents      = buono/sconto ( ≥ 0 )
amountPaidCents    = listino − sconto = CORRISPETTIVO
```

- CE ricavi e IVA sul **amountPaidCents**
- Match gateway / Stripe / PayPal sul **amountPaidCents**
- `grossAmount`/`stripeFee`/`netAmount` restano audit trail del PSP
- Impatto: migrazione campi + backfill da gateway dove noto (es. Isabella €299,90 → €284,90); matching smette di fallire sui buoni

---

## 4) Fioristi contati due volte

| | N | Euro |
|--|---|------|
| `FLORIST_PAYOUT` 2026 | 27 | — |
| Match **certo** (stesso fiorista/shop, importo esatto, ±15g, bonifico `COSTI_FIORISTI`) | **6** | **€154,00** |
| Cumulativi sospetti (bonifico ≥ payout, nome overlap) | 6 | €161,00 |
| Ancora **entrambi visibili in CE** dopo gerarchia | **≈ 0** | **€0** impatto RAI oggi |

La gerarchia fiscale sopprime già la maggior parte dei `FLORIST_PAYOUT` quando esiste il bonifico: il doppio conteggio **strutturale** c’è (6 certi + cumulativi), ma **non muove il RAI** finché il dedupe tiene. Priorità: non indebolire la gerarchia; audit puntuale sui 6 certi.

---

## 5) Risconto Isabella

Pacchetto corrispettivo **€284,90** · 11 consegne · **7** ancora dovute (primavera 2027).  
In DB: 4 pose `FT-MC-26-003…006` a €29,99 con compenso fiorista **€20**/posa.

| | Quota 2027 |
|--|------------|
| Ricavo da riscontare | **€181,30** (€25,90 × 7) |
| Costo fiorista da riscontare | **€140,00** (€20 × 7) |

Operativo: 3 COMPLETED · 1 PENDING il **12/09/2026** · 7 aperte.

---

## 6) Mammì — txn `3U5R2d`

**Importo reale Stripe (Neon `stripe_finance_movements`):** **€31,48** (fee €1,58 · net €29,90).  
API Stripe live: chiave test scaduta — fonte attendibile = tabella sync.

Il **17/08/2026** risultano **due** payment distinti da €31,48:
- `txn_3U5QyD…` → FT-PA-26-008
- `txn_3U5R2d…` → una sola charge

FT-CS-26-005 (UNPAID) e FT-CS-26-006 (PAID) **condividono lo stesso riferimento nel CSV** di riconciliazione: match falso. Una sola delle due è coperta da `3U5R2d`.

**Pattern ricorrente Mammì** (stesso giorno, stesso importo €31,48, UNPAID+PAID):

| Data | UNPAID | PAID |
|------|--------|------|
| 2026-05-20 | FT-PA-26-002 | FT-PA-26-003, FT-CS-26-001 |
| 2026-07-30 | FT-CS-26-004 | FT-PA-26-007 |
| 2026-08-17 | FT-CS-26-005 | FT-CS-26-006, FT-PA-26-008 |

Inoltre: doppio ingest SFM (`txn_` + `stripe_tx_txn_`) → doppia riga fee in ledger (−€1,58 × 2) sullo stesso pagamento.

---

## 7) Δ €60 banca

| Formula | Valore |
|---------|--------|
| **A — cash PnL** = opening Q1 + Σ *tutte* le `bank_statement_lines` 2026 | **€32.006,13** |
| **B — calculated** (quadratura: rispetta chiusura Q2 + movimenti successivi) | **€31.966,13** |
| **C — reale manuale** Fineco (`SystemState`, allineato 2026-09-06T19:45Z) | **€31.946,13** |

### Righe che compongono la differenza

1. **€40** — buco interno del PDF Q1: `opening + Σ lines_Q1 − closing = +€40`.  
   La formula A parte dall’opening e somma i movimenti → **trascina +€40** rispetto alla catena che si fida del `closingBalance` Q1/Q2.
2. **€20** — scarto B−C: saldo manuale impostato **2 minuti prima** del paste `fineco-paste-2026-09-06T19:47` (movimenti già in Fineco ma allineamento stale), oppure differenza UI Fineco vs estratto. Nessuna riga singola da ±€60; nessun duplicato day+amount.

**Invariante ufficiale:** **formula A (cash PnL = opening primo rendiconto + Σ movimenti di periodo)** è quella del motore `computeHistoricalPnl` / CE.  
Il saldo manuale è **allineamento operativo admin**, non invariante contabile. La fascia quadratura espone B e C per controllo.  
Finché Q1 non quadra internamente e il manuale non viene riallineato post-paste, A−C resterà €60.

Nota qualità dati: in `fineco-paste-2026-08-24` c’è una riga **2025-12-02 €32.410,30** «Movimento Fineco (incolla)» (saldo spacciato da movimento) — oggi fuori filtro 2026, ma va ripulita.

---

## 8) Margine per ordine (ex carnet)

Paid 2026 non cancellati: **38** · esclusi recurring/carnet: **4** · base: **34** · con `floristCompensationCents`: **24** (10 senza costo fiorista in anagrafica).

| | |
|--|--|
| Ricavi (gross o listino) | €1.393,02 |
| Costi fiorista | €803,00 |
| **Margine** | **€590,02** (**42,4%**) |
| Medio / mediano | avg **€24,58**/ordine |

Caveat: perimetro piccolo (solo ordini con compenso valorizzato); non include .eu mancanti né pose Isabella (escluse come carnet).
