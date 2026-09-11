# Verbale — 11 settembre 2026 — taxRegister pose + carnet Isabella

## Contesto
Le pose del carnet Isabella (€25,90) entravano nel **Registro fiscale** (`taxRegister`) perché il filtro `isPrepaidSubscriptionPoseOrder` non era applicato lì, a differenza di corrispettivi gateway e ledger ricavi. Il registro alimenta la lettura IVA: priorità sulla registrazione carnet.

## 1) Fix perimetro `taxRegister` (METODO v1.13 §13)

Esclusione pose con lo stesso predicato già usato altrove.

### Totali T3 — prima (bug) → dopo (filtro + dati)

| Metrica | Prima (bug) | Solo filtro codice (pose ancora a €25,90; Giulio ancora `isRecurring`) | Stato finale (dopo registrazione + correzione Giulio) |
|--------|-------------|------------------------------------------------------------------------|------------------------------------------------------|
| Righe | 35 | 31 (−4) | 32 |
| Lordo | €1.874,64 | €1.756,95 (−€117,69) | €1.796,94 (−€77,70 vs bug) |
| Imponibile floreale | €1.704,25 | €1.597,25 | €1.633,60 |
| IVA debito | €170,39 | €159,70 (−€10,69) | €163,34 (−€7,05 vs bug) |

Interpretazione: il filtro da solo toglieva **4** righe / **€117,69** (3 Isabella + Giulio falso positivo). Corretto Giulio (`isRecurring=false`), il delta netto rispetto al bug è **−3 righe Isabella / −€77,70** lordo / **−€7,05** IVA.

### Altri canali senza filtro pose (audit)

| Canale | Stato |
|--------|--------|
| `taxRegister` | **Era difettoso → corretto** |
| Corrispettivi dossier / `buildGatewayCorrispettivi` | OK (solo gateway) |
| `historicalLedgerSync` / query CE | OK (esclude ricavi pose) |
| `taxQuarterly` fee/order loop | OK (skip pose) |
| `cfoTools.getCompanyFinancialHealth` | **Difetto analogo → corretto** (stima inflow 30gg) |
| `partnerCommissionRegister` / registri fiorista | Non ricavo IVA; usano totale ordine per fee/compenso (pose a €0 dopo storno) |
| `customerReceipt` | Per-ordine on-demand; non aggregato trimestrale |

## 2) FF-PD-26-004 Giulio Rosace — **falso positivo**

- Vendita singola «Abbraccio Verde» €39,99, `IMPORT_MANUALE`, **senza** «Duplicato da», nessun pacchetto padre.
- `isRecurring=true` la faceva classificare come posa → esclusa dai ricavi ledger (e, col fix, anche da taxRegister) **senza essere esecuzione di un prepagato**.
- Esiste charge Stripe EU `stripe_eu_tx_txn_3TrNud…` del **09/07/2026** €39,99 ancora `orderId=null` (abbinamento **non** fatto in questo lotto).
- Azione: `isRecurring=false` + nota in `financeNotes`.

## 3) Registrazione carnet Isabella (confermata)

| Campo | Valore |
|-------|--------|
| Ordine | **FT-MC-26-007** |
| Data | **03/05/2026** (non 02/07) |
| Cliente | Isabella Cesaroni · isa.cesaroni@gmail.com |
| Prodotto | Carnet Ricordo Affettuoso (dismesso) via SKU Ricordo Affettuoso |
| Importo | €284,90 · IVA 10% (imponibile €259,00 + IVA €25,90) |
| Destinatario | Anna Maria Rumori · Cimitero comunale Civitanova Alta (MC) |
| Gateway | `stripe_eu_tx_txn_3TSzMsRrkwwcYwep11EAvI3P` collegato |

Pose FT-MC-26-003…006: totale **€0**, restano esecuzioni `isRecurring`, annotate `ESECUZIONE_CARNET:FT-MC-26-007` + `DOSSIER_ECCEZIONE` / storno (non cancellate). `partnerPaymentStatus` fiorista invariato (costo vivo).

### Accettazione T2 no-order

| | Prima | Dopo |
|--|-------|------|
| Incassi senza ordine | **45** | **44** |
| Somma no-order | €789,19 | €504,29 |
| Δ | | **−1 riga / −€284,90** |
| €284,90 ancora no-order | sì | **no** |

**OK.**

## 4) METODO

- Versione **1.13** — nuovo **§13** prodotti prepagati a consegne multiple (carnet dismesso; IVA intera al pagamento; pose €0; risconto = commercialista).
- `DOSSIER_METHOD_VERSION = '1.13'`.
- Eccezioni da `financeNotes` con prefisso `DOSSIER_ECCEZIONE:` → foglio Eccezioni dossier.

## 5) Non fatto (per scelta)

- Nessun modello `parentOrderId` / conteggio residue carnet (prodotto abolito; risconto a mano una volta).
- Nessun abbinamento Stripe Giulio 09/07 (segnalato, fuori perimetro accettazione).

## Script

`scripts/register-isabella-carnet-2026-05-03.ts` (eseguito in scrittura; accettazione passata).
