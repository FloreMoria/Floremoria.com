# Verbale — Collegamento incassi ↔ ordini (avanti + storico RO)

**Data:** 09-09-2026 · **Ora:** ~19:30 Europe/Rome  
**Premessa:** il blocco MANCANTE >30% resta **acceso**. I dossier T1–T3 v1.9 generati in bypass restano non usabili per liquidazione.

## Diagnosi confermata

| Trimestre | Lordo gateway build | Mancante | DETERMINATA |
|---|---:|---:|---:|
| T1 | €1.057,39 | 38,0% | €0 |
| T2 | €1.801,88 | 56,7% | €0 |
| T3 | €2.381,02 | ~50% post-match tx* | €672,29 |

\* Dopo match in sola lettura `Order.stripeTransactionId` ↔ `txn_` sul movimento, T3 recupera 10 collegamenti; T1/T2 restano a zero DETERMINATA.

Ordini PAID 2026: **44**. Con `stripeTransactionId` valorizzato: **6** (tutti fine agosto–settembre, formato `txn_…`). Manuali tag `IMPORT_MANUALE`: **15**.

## Da qui in avanti (fatto)

1. **Checkout** — `payment_intent_data.metadata` con `orderId` + `orderNumber` (prima solo sulla Session).
2. **Webhook Stripe** — salva su `Order.stripeTransactionId` il **`pi_…`** (PaymentIntent), non più solo il `txn_…`.
3. **stripeSync** — risolve `orderId` da metadata PI/Charge + match su `stripeTransactionId`; salva `receiptEmail` / `billingName` in `metadataJson` per futuri match soft.
4. **Ordine manuale dashboard** — campo obbligatorio se pagato: riferimento transazione gateway + canale di incasso (`CreateOrderModal` → API → `createDashboardManualOrder`).

Campo schema: già esisteva `Order.stripeTransactionId` (unique). Nessuna migration.

## Storico (sola lettura — nessuna scrittura)

Script: `scripts/reconcile-gateway-orders-readonly-2026.ts`  
Report: `docs/verbali/09-09-2026-reconcile-gateway-orders-readonly.md`

| Periodo | Incassi | Già collegati | Match tx id | Match email | Match nome+data | Scoperti |
|---|---:|---:|---:|---:|---:|---:|
| T1 2026 | 25 | 0 | 0 | 0 | 0 | 25 |
| T2 2026 | 57 | 0 | 0 | 0 | 0 | 57 |
| T3 2026 | 55 | 10 | 0 | 0 | 0 | 45 |

**Lettura:** email/nome sui movimenti Stripe in DB sono assenti (sync storico senza receipt) → soft match a zero. Il prossimo giro soft-match diventa fattibile dopo un re-sync Stripe che popola `receiptEmail`. Il vuoto vero è: **ordini senza `stripeTransactionId`** (manuale / .eu senza paste).

## Domanda al commercialista (una riga)

> Per il primo trimestre 2026, quanto hai registrato di ricavi / corrispettivi lordi FloreMoria?

Noi in dossier (non usabile) eravamo a €655,84; le vendite verificate a mano sul 2026 intero sono €4.587,01.

## Capitale sociale

€11.410 = versato dichiarato su aggregatore RI → footer `.com` OK, non si tocca. `.eu` con €10.000: leave.

## File toccati

- `app/api/checkout/route.ts`
- `app/api/webhooks/stripe/route.ts`
- `lib/financial/stripeSync.ts`
- `lib/financial/dossierCorrispettiviBuild.ts`
- `lib/orders/createDashboardManualOrder.ts`
- `app/api/dashboard/orders/route.ts`
- `components/dashboard/CreateOrderModal.tsx`
- `prisma/schema.prisma` (solo commento)
- `scripts/reconcile-gateway-orders-readonly-2026.ts`
- `docs/verbali/09-09-2026-reconcile-gateway-orders-readonly.{md,json}`
- questo verbale
