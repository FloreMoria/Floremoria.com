# Verbale — Gateway vince · §8.3 aliquote · batch EU_HIST · residuo MANCANTE

**Data:** 10 settembre 2026 · Europe/Rome  
**Scritture DB in questo giro:** nessuna (diagnosi + codice/metodo)

---

## 1. Gateway vince sulla lista

**Regola (§8.2):** abbinato a movimento gateway → importo = **lordo gateway**; lista solo identifica; delta → Eccezioni.

| | |
|---|---|
| Amanda Favot | **€39,99** (Stripe EU `txn_3U5RyE…`) — corretto in fixture (era €39,98 lista) |
| Totale .eu valorizzato (43, post-correzione) | **€ 2.474,82** |
| Delta lista↔gateway residui | **0** (dopo allineamento Amanda) |

### Canale «Partner» (fixture + DB)

| | |
|---|---|
| In fixture etichettati Partner | **2** (Amanda Favot, Oreste Poverello) |
| Significato operativo | Ordine con **fiorista partner** assegnato (`partnerId` valorizzato). Il **cliente paga FloreMoria** (Stripe/PayPal) al **lordo**; il compenso fiorista è costo separato, non netto da scorporare dal corrispettivo (§8.2). |
| T3 .eu già su `.com` | **9/9** hanno `partnerId` (FF-PD / FT-PD / FF-PN / FT-RC) — stesso modello: lordo cliente, non netto accredito fiorista. |

---

## 2. Aliquote §8.3 (METODO v1.12 — committato)

Solo **10%** fiori / **22%** accessori, **per riga prodotto**.

Ordine: anagrafica Prodotti → DETERMINATA; storico `.eu` senza prodotto → PRESUNTA 10%; altrimenti MANCANTE. Vietata stima imposta/imponibile.

**Ordini .eu con righe accessorio (22% attese):** **10**  
(nastri / biglietti / lumini — es. Paladino, Congedo, Durì, Redivo, Tregnaghi, Pozzi, Manakova, Nicolato).  
Quelle righe **non** devono andare al 10% di testata: serve split DETERMINATA da `Product.vatRatePercent` quando il prodotto è in anagrafica.

---

## 3. Stato database — batch `EU_HIST_20260910_A`

| Domanda | Risposta |
|---|---|
| Applicato a DB? | **SÌ** |
| Quando | **10 settembre 2026** (stesso giorno; codice import ancora non era in git al momento dell’apply) |
| Commit git dell’apply | **nessuno** — file `importEuHistoricalOrder.ts` / dry-run erano untracked; batch solo su Neon |
| Ordini creati | **33** |
| Righe `OrderItem` | **47** |
| Per trimestre (createdAt ordine) | T1 **21** · T2 **12** · T3 **0** (T3 già su `.com`; Isabella esclusa dal lotto) |

### Confronto con i 43 della lista

| Bucket | N |
|---|---:|
| Import storico batch (tag `IMPORT_EU_HISTORICAL:EU_HIST_20260910_A`) | 33 |
| T3 già su `.com` (9 buyer .eu, tutti con partner fiorista) | 9 |
| Isabella carnet (incasso gateway, non nel batch import) | 1 |
| **Totale perimetro 43** | **43** |

---

## 4. Residuo MANCANTE T2 / T3 (non .eu) — sola lettura

I .eu del perimetro sono abbinati; il ~48–50% residuo è altro.

### T2 (MANCANTE 47,6% · €858,20)

| | |
|---|---|
| Incassi MANCANTE senza ordine | **43** |
| Di cui PayPal | **32** · €415,91 |
| Di cui Stripe (.com) | **11** · €442,29 |
| Bonifico | **0** in questo bucket |
| Media | **€19,96** |
| Con ordine ma MANCANTE | **0** |

Top 10 (abs): 64,98 Stripe 22/06 · 54,98 / −54,98 Stripe 30/05 · 48,64 PayPal 06/05 · 43,97 Stripe 13/06 · … (dettaglio in JSON).

### T3 (MANCANTE 49,8% · €1.185,83)

| | |
|---|---|
| Incassi MANCANTE senza ordine | **45** |
| PayPal | **26** · €702,04 |
| Stripe | resto (py_/ch_ .com) |
| Media (no-order) | ~€26 |

### Ipotesi PayPal «senza riferimento»

- Metadata CSV: **no** `payerEmail` / `counterpartyName` (campi assenti).
- C’è però `description` tipo `Pagamento Express Checkout · NOME · Ordine FloreMoria` + `referenceId`.
- Aggancio possibile: **parse nome da description** + data±3 + importo lordo; fee/commissioni/cashback/storni da escludere.
- Non è «senza TX»: l’id transazione c’è; manca l’anagrafica strutturata.

JSON: `docs/verbali/10-09-2026-eu-diagnosi-mancante-residuo.json`

---

## File toccati (commit mirato)

- `docs/METODO_DOSSIER_FISCALE.md` (v1.12)
- `lib/financial/taxQuarterlyXlsx.ts` (`DOSSIER_METHOD_VERSION=1.12`)
- `lib/financial/euOrders2026Match.ts`, `dossierCorrispettiviBuild.ts`
- `scripts/data/floremoria-eu-orders-2026.json`
- verbali di questo giro
- (in commit: anche path import EU + dedupe passivi già pronti, se in staging mirato)
