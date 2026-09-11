# Verbale 11-09-2026 — Rumore RICAVI_VENDITE + contributo CCIAA

**Fatturato commerciale ufficiale:** €4.098,68 (invariato)  
**Batch:** `RV_NOISE_CLEANUP_20260911`

---

## A. Rumore in `RICAVI_VENDITE` — quantificazione

### Stato grezzo prima della pulizia (conto, non PnL gerarchia)

| Natura | n | € (segno) | Azione |
|--------|--:|----------:|--------|
| **JSON doppio** (stesso ordine già su Stripe/MANUAL) | 38 | **+2.011,83** | → `TRASFERIMENTO_INTERNO` |
| **JSON unico** (resta copertura) | 4 | +137,43 | resta ricavo, orderId collegato |
| **SDD PayPal / ricarica wallet** (negativi in RV) | 12 | **−238,98** | → `TRASFERIMENTO_INTERNO` |
| **Movimento fiorista** (bonifici in spese operative) | 5 | **−390,00** | → `COSTI_FIORISTI` |
| STRIPE_TX (incassi gateway) | 60 | +3.472,37 | resta (transito vendite) |
| MANUAL_INBOUND (fuori gateway) | 31 | +1.474,47 | resta (fuori gateway, è vendita) |

**Cashback:** già fuori da RV dal giro architettura PayPal (in `ALTRI_RICAVI` / sopravvenienza).  
**Spese Poste/Ubigi/SaaS in RV:** già riclassificate nel giro precedente → `SPESE_*`.

### Negativi storici −€2.693,19 (stesso problema)

Dal freeze pre-L3 (51 righe in hierarchy vendite):

| Origine | n | € | Dove sono oggi |
|---------|--:|--:|----------------|
| PayPal | 27 | −1.490,18 | quasi tutte `SPESE_OPERATIVE` / `SPESE_SAAS` |
| Bank line | 24 | −1.203,01 | `TRASFERIMENTO_INTERNO` (Lotto 3 / payout) |
| **Totale** | 51 | **−2.693,19** | **0 rimaste in `RICAVI_VENDITE`** |

La quota «bancarie mai chiarite» (~€1.070–1.203) non è più in ricavi: è in partite di giro. I PayPal negativi sono costi CE, non riduzioni di ricavo.

### Dopo pulizia

| | € |
|--|--:|
| RV positivi grezzi | 5.084,27 (Stripe 3.472 + Manual 1.474 + JSON unico 137) |
| vs ufficiale 4.098,68 | **+985,59** ancora da riconciliare (possibili doppi Stripe↔ordine senza `orderId`, TX fuori lista) |
| PnL vendite caratteristiche | **3.665,31** (gerarchia fiscale; sotto ufficiale di ~€433) |

Il fatturato commerciale resta **€4.098,68**. Il conto grezzo sopra e il PnL sotto sono ancora rumore / coverage da chiudere in un giro successivo — non si forza il numero.

### Effetto CE

| | Prima | Dopo | Δ |
|--|------:|-----:|--:|
| Vendite caratteristiche | 3.858,25 | **3.665,31** | −192,94 |
| Altri ricavi | 32,81 | 32,81 | 0 |
| Contributi | 4.597,66 | 4.597,66 | 0 |
| **RAI** | **−3.898,56** | **−3.852,52** | **+46,04** |

---

## B. Contributo €4.597,66 (05/02/2026)

**Causale:** Ord: Cciaa Como-Lecco · Banca Ord: Iconto Srl · *Liquidazione Contributo Bando Nuova Impresa 2025* · Ben: Floremoria S.r.l.

### 1. Dov’è oggi?

- Conto: **`CONTRIBUTI_ESERCIZIO`** (mastro 65000 — contributi in conto esercizio).
- **Entra nel CE / RAI:** sì.
- **Il RAI di −€3.764,48 (freeze Lotto6) è DOPO questo contributo** (già incluso).  
  Stessa logica sul RAI corrente: **−€3.852,52 include i +€4.597,66**.  
  RAI **senza** contributo = **−€8.450,18**.

### 2. Classificazione

Già fuori dalle vendite. Etichetta operativa: **«Altri ricavi e proventi — contributo pubblico»**.  
Fatturato commerciale **€4.098,68** non lo include in nessuna vista vendite.

### 3. IVA

- Corrispettivi gateway: **0 hit** su €4.597,66 / CCIAA / Iconto.
- Liquidazione T1: **nessuna IVA a debito errata** generata da questa riga (fuori campo IVA).

### 4. UI Contabilità / dossier

- Banner dedicato in Archivio storico fiscale.
- Prima Nota: mastro distinto `65000` (non più confuso con 60100 vendite).
- Label categoria aggiornata.

### 5. RAI prima / dopo (classificazione contributo)

Il contributo era **già** in `CONTRIBUTI_ESERCIZIO` (classificazione corretta).  
Effetto della sola pulizia rumore RV (non del contributo):

| | € |
|--|--:|
| RAI prima pulizia rumore | −3.898,56 |
| RAI dopo pulizia rumore | **−3.852,52** |
| RAI se si togliesse il contributo dal CE | −8.450,18 |

---

## File

- `scripts/apply-rv-noise-cleanup.ts`
- `docs/verbali/11-09-2026-rv-noise-cleanup.json`
- `docs/verbali/11-09-2026-diag-rv-noise.json` / `-detail.json`
