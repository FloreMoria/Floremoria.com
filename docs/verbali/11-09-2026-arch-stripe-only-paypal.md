# Verbale 11-09-2026 — Architettura Stripe-only · PayPal conto pagamento

**METODO:** v1.19  
**Fineco (riferimento utente, 185 mov., 11/09/2026):** Stripe giroconti **€2.878,26** · PayPal **€569,88** · tot. **€3.448,14**  
**Saldi dichiarati:** Stripe **€100,00** · PayPal **€0,00**

---

## Correzione concettuale

PayPal **non** è un gateway di vendita. I clienti pagano via **Stripe** (anche con metodo PayPal).  
Il conto PayPal è un **conto di pagamento** (spese / residuali).  
Gli ordini mai passati da Stripe stanno in **incassi fuori gateway** (`10400`, `MANUAL_INBOUND`).

---

## 1. Transito Stripe — quattro addendi (2026)

| Addendo | n | € |
|---------|--:|--:|
| Incassi cliente `STRIPE_TX` | 60 | **3.472,37** |
| Commissioni `STRIPE_FEE` | 94 | **130,07** |
| Rimborsi `STRIPE_REFUND` | 3 | **139,95** |
| Payout ledger `STRIPE_PAYOUT:po_*` | 45 | 3.097,50 |
| **Payout Fineco (riferimento)** | 46 | **2.878,26** |

### Equazioni (nessun aggiustamento forzato)

```
TX − FEE − REFUND − Fineco_payout
3.472,37 − 130,07 − 139,95 − 2.878,26 = 324,09
atteso saldo dichiarato 100,00  →  Δ = +224,09
```

```
TX − FEE − REFUND − payout_ledger
3.472,37 − 130,07 − 139,95 − 3.097,50 = 104,85
atteso 100,00  →  Δ = +4,85
```

**Cosa è fuori (con payout Fineco):** principalmente la gamba **payout** — il ledger ha **€219,24** in più rispetto ai giroconti Stripe Fineco (€3.097,50 − €2.878,26). Quella sola differenza spiega quasi tutto il +€224 vs €100 (residuo ~€4,85 = stesso scarto dell’equazione a payout ledger).

**Cosa gonfiava C13 di ~€3.829:** `MANUAL_INBOUND` (€1.474,47) e `JSON_ENTRY` (€624,83) sul mastro Stripe — ora spostati a **incassi fuori gateway**. Non sono `STRIPE_TX`.

---

## 2. Conto PayPal (non transito vendite)

| Azione | n | € |
|--------|--:|--:|
| Inbound «vendite» azzerati (`PAYPAL_TX` → `TRASFERIMENTO_INTERNO`, no orderId) | 14 | 577,32 |
| Spese riclassificate da RV a costi CE | 9+36 | ~1.805 |
| Payout ledger vs Fineco | 25 / 27 | 566,76 / **569,88** (Δ −€3,12) |

**Spese PayPal in CE (dopo):**

| Categoria | n | € |
|-----------|--:|--:|
| `SPESE_OPERATIVE` | 39 | 1.788,47 |
| `SPESE_SAAS` | 32 | 529,93 |
| `ONERI_BANCARI` | 16 | 27,69 |
| `ALTRI_COSTI` | 1 | 1,24 |
| **Totale costi PayPal** | **88** | **≈ 2.347** |

Erano (in parte) in `RICAVI_VENDITE` con segno negativo → **riduzione di ricavo**. Ora sono **costi**.  
`PAYPAL_TX` rimasti in `RICAVI_VENDITE`: **0**.

---

## 3. «Altro Ricavo / Entrata Diretta» €4.656,37

Composizione ricostruita:

| € | Data | Causale / ordinante | Contabile oggi |
|--:|------|---------------------|----------------|
| **4.597,66** | **05/02/2026** | Ord: **Cciaa Como-Lecco** · Banca Ord: **Iconto Srl** · Info-Cli: **Liquidazione Contributo Bando Nuova Impresa 2025** · Ben: Floremoria S.r.l. | Ledger `CONTRIBUTI_ESERCIZIO` (non `ALTRI_RICAVI`) |
| 30,09 | 07/04/2026 | Wix.com Luxembourg / Adyen — Wix Payments | `ALTRI_RICAVI` |
| 28,62 | 30/03/2026 | PayPal Europe — giroconto / fondo | `INTERNAL_TRANSFER` (banca) |
| **4.656,37** | | | |

**Non è un versamento soci / apporto di capitale.** È un **contributo pubblico** (bando).  
Già fuori dalle vendite caratteristiche; resta nel **CE / RAI** come contributo in conto esercizio (+€4.597,66 sul RAI). Non va tolto come se fosse patrimonio netto, salvo diversa lettura del commercialista sul bando.

---

## 4. Scarto residuo €372

```
Vendite 4.098,68 − fee rif. 178,49 = 3.920,19 attesi
Fineco 3.448,14 + saldo Stripe 100 = 3.548,14
Scarto = 372,05
```

| Ipotesi | Peso € | Nota |
|---------|-------:|------|
| **A. Settembre / T3 non ancora versato** | **~529** (proxy T3 lista €1.849 − Fineco Stripe T3 €1.320) · sett. lista **€428,91** | Plausibile; sovra-spiega da solo lo scarto se preso al lordo |
| **B. Commissioni > €178,49** | **−48,42** | Fee ledger 2026 = **€130,07** (< rif.); all-time `STRIPE_FEE` ≈ **€178,70** ≈ rif. **Non** spiega uno scarto positivo |
| **C. Ordini fuori Stripe** | **€1.474,47** (31 `MANUAL_INBOUND`) | Pesano sul commerciale e sul fuori-gateway; **non** devono entrare nel transito Stripe. Parte del cash può essere già nei giroconti PayPal Fineco (€569,88) o ancora pending |

Lo scarto €372 non è una sola causa: A è la più plausibile sul timing Stripe→Fineco; C spiega perché TX Stripe (€3.472) < vendite ufficiali (€4.099).

---

## 5. C13 nuovi perimetri

| Pezzo | Ledger | Dichiarato | Δ | Esito |
|-------|-------:|-----------:|--:|-------|
| **Stripe** (flusso 2026 TX−FEE−REFUND−PAYOUT ledger) | **104,85** | 100,00 | **+4,85** | Quasi chiuso; **non forzato** |
| Stripe se si usa payout Fineco nella formula | 324,09 | 100,00 | +224,09 | Fuori = payout ledger vs Fineco €219,24 |
| **PayPal** (conto pagamento, non ciclo vendite) | **−1.990,06** | 0,00 | −1.990,06 | Aperto: riconciliazione conto vs estratto (spese + residuali); **non** è più C13 «transito vendite» |

C10: solo Stripe; PayPal escluso (OK strutturale lato PayPal).

---

## 6. Aperti dai giri precedenti

### Commissioni €178,49 in CE?
**Sì, come oneri.** `STRIPE_FEE` → categoria `ONERI_BANCARI`.  
- Cumulo chiavi `STRIPE_FEE` (all-time): **≈ €178,70** (allineato al riferimento €178,49).  
- Solo fiscalYear 2026: **€130,07** in CE.  
Quindi il riferimento €178,49 è già (quasi interamente) in CE sul perimetro fee Stripe; la quota 2026 isolata è €130,07.

### Δ €488,33 lista .com vs motore
Già chiuso in diagnosi `11-09-2026-punto7-com-488.md`:  
motore freeze €2.919,99 − lista .com €2.431,66 = **€488,33** = PayPal orfani nel freeze − FT- non nel freeze.  
**Lista corretta.** IVA a debito **non** in eccesso per quella Δ (ledger `vatCents=0`; corrispettivi su checkout = vendite .eu reali).

---

## 7. METODO

Aggiornato a **v1.19**: §6.2.1 riscritto (Stripe unico transito vendite · PayPal conto pagamento · fuori gateway); C10/C13 e gerarchia fonti allineati.

---

## Apply dati (batch `ARCH_STRIPE_ONLY_20260911`)

- 31 `MANUAL_INBOUND` → mastro `10400` fuori gateway  
- 14 inbound PayPal vendite → `TRASFERIMENTO_INTERNO`  
- spese PayPal da RV → `SPESE_*`  
- 9 `JSON_ENTRY` tolti dal meta Stripe  

Codice: `sumStripeSalesTransitCents(year)`, `ACCOUNT_INCASSI_FUORI_GATEWAY`, C10/C13, `gatewayTransitSync`.
