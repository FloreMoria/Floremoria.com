# Verbale — METODO v1.6 indagine (punti 1–4) — STOP pre Fase 3

**Generato:** 2026-09-08  
**Spec:** `docs/METODO_DOSSIER_FISCALE.md` **v1.6**  
**Ambito:** sola lettura + commit metodo/verbale. Nessuna deduplica applicata in scrittura.

---

## 1 — Deduplica fatture passive (Report ↔ Youdox)

**Canali in DB**

| source `metadataJson` | N 2026 | Ruolo |
|---|---|---|
| `SDI_XLSX` | 50 | Report periodico `Report_Fatture_ricevute_*.xlsx` |
| `SDI_XML` | 15 | Sync YouDOX |
| altri (autofatture / unknown) | 37 | fuori dal confronto canale 1↔2 |

**Report 2026** (union T1+T2+T3+annuale, chiavi uniche fornitore+data+numero): **61** documenti.

**Presenti su entrambi i canali** (Report ∩ Youdox/`SDI_XML`): **13** documenti  
**Importo complessivo (totale documento Report):** **€ 623,00**  
(imponibile Report somma: € 568,16)

Esempi: Shoppingarden 19/2026 · 17/2026 · 14/2026 · 20/2026; Battistella 235 · 253; Cingolani 35; Maspes; La Baita 46; Margherita Flower 11; Ferrante 28 · 18; Rose e Tulipani 5.

Regola v1.6: in tabella/totali resta Youdox; il gemello Report va in Eccezioni come «documento già acquisito da canale prioritario». **Non implementato in questo giro** (solo misura).

---

## 2 — Perimetro .eu (verifica)

Perimetro dichiarato: 43 / € 2.559,81 · dal 02/07 su .com: 9 / € 592,89 · Isabella 03/05 a libro · restano 33 / € 1.667,02.

### i) I 9 dal 02/07 sul .com

| Lista titolare | DB .com | Note |
|---|---|---|
| 8 su 9 | Match PAID (nome+importo±data) | OK |
| Amanda Favot 17/08 €109,98 | **FF-PN-26-003** esiste, PAID, data OK, ma totale **€ 39,99** (solo Omaggio Speciale) | Scostamento importo lista↔DB; Stripe EU stesso giorno €39,99 |

Quindi: **sì, i nove acquirenti risultano sul .com**; uno ha importo diverso dalla lista (€109,98 vs €39,99).  
Non risultano tra i «.eu non registrati» del carnet pre-luglio (sono etichettati «Sito . com»).

### ii) Gateway → più ordini

- `StripeFinanceMovement.stripeId` → più `orderId`: **0**
- `Order.stripeTransactionId` duplicato su più ordini: **0**

Nessuna transazione gateway collegata a più di un ordine.

---

## 3 — Misure aperte (sola lettura)

**Filtro trimestre T2:** `2026-04-01` … `2026-06-30` su  
`StripeFinanceMovement.createdAtStripe` · `FinancialLedgerEntry.accountingDate` · `Order.createdAt`.

### Incassi gateway T2

| Fonte | Criterio | N | Importo |
|---|---|---|---|
| Stripe | tipi `charge` + `payment` (come conteggio grezzo, **include duplicati** `txn_` / `stripe_tx_txn_` e alcuni €0) | **33** | **€ 1.524,86** |
| Stripe | stessi tipi, **unici** per id nudo, solo importi > 0 | 20 | € 1.137,55 |
| Stripe | `refund` | **3** | **€ 139,95** |
| PayPal | movimenti `totalCents > 0` esclusi `SPESE_SAAS` e `PAYPAL_PAYOUT` | **35** | **€ 579,36** |
| PayPal | solo `RICAVI_VENDITE` > 0 | 24 | € 472,38 |

Allineamento al riferimento manuale: Stripe 33/€1.524,86 e rimborsi 3/€139,95 **identici**. PayPal 35 righe sì, importo **€579,36** vs €593,79 (Δ ≈ €14,43) — da chiarire con il titolare sul criterio di somma.

**Esclusi (Stripe):** payout, payout_minimum_balance_hold/release, stripe_fee, contribution.  
**Esclusi (PayPal nella misura 35):** SPESE_SAAS, PAYPAL_PAYOUT.

### Con / senza ordine

- Stripe `charge`/`payment` in T2: `orderId` sul movimento quasi sempre **null**; match euristico importo±2gg → **9** con ordine DB, **11** unici positivi senza (quasi tutti `stripe_eu_tx_*` del periodo Apr–Giu non portati a Order).
- PayPal incassi positivi (35): **nessuno** con `orderId` valorizzato.

### Ordini T2 in DB (`createdAt`)

| status | N |
|---|---|
| COMPLETED | 8 |
| CANCELLED | 3 |
| **Totale non-test** | **11** |
| di cui PAID | 10 |

**Differenza 9 vs 13 .eu:** i **9** del riporto .eu→.com partono dal **02/07/2026 (T3)**, non dal T2. In T2 la lista titolare ha **13** vendite .eu non su .com (Apr–Giu). Nel DB T2 non c’è un tag EU affidabile sugli Order (0 `stripe_eu` su `stripeTransactionId` in T2); i 10 PAID T2 sono misti UNKNOWN/storico.

### 77 venduti vs 97 OrderItem

| Bucket | Righe |
|---|---|
| Incluse nel “Venduti” (non cancellati, non test, non deleted) | **77** |
| Solo CANCELLED | 5 |
| Solo test | 2 |
| test ∩ deleted | 1 |
| CANCELLED ∩ deleted | 12 |
| **Totale** | **97** |

Le 20 “in più” non sono deduplica fatture: sono OrderItem su ordini esclusi dal conteggio catalogo (cancellati / test / soft-delete).

---

## 4 — Catalogo

| Check | Esito |
|---|---|
| Nastro Piccoli Amici → 22% | **OK** (`vatRatePercent: 22`) |
| Messaggio / Foto stato di fatto / Nastro commemorativo costo **0** | **OK** (`floristStandardCostCents: 0`) |
| Aliquote mancanti | **0** (tutte compilate) |
| Zero vs non compilato | Campo già `Int?`: **`null` = non compilato**, **`0` = gratis confermato**. Commento schema aggiornato. Nessuna migration extra. |

---

## STOP

Fase 3 (corrispettivi) **non avviata** — come richiesto: parte dopo il punto 3 / OK titolare.

### File

- `docs/METODO_DOSSIER_FISCALE.md` (v1.6)
- `docs/verbali/dossier_metodo_v16_indagine_punti_1_4.json`
- `docs/verbali/dossier_metodo_v16_indagine_punti_1_4_refine.json`
- `docs/verbali/dossier_metodo_v16_indagine_punti_1_4.md` (questo)
- `scripts/investigate-metodo-v16-readouts.ts`
- `scripts/investigate-metodo-v16-refine.ts`
- `prisma/schema.prisma` (commento convenzione costo 0 vs null)
