# Verbale — Import storico .eu 2026 (33 ordini) + rimisura MANCANTE

**Data:** 10-09-2026 · Europe/Rome  
**Batch:** `EU_HIST_20260910_A`  
**Ambito:** Contabilità / collegamento gateway ↔ ordini (no ledger, no notifiche)

## Correzione titolare (pre-apply)

- Isabella Cesaroni 03/05: listino carnet **€299,90** − sconto **€15,00** = incassato **€284,90** (elenco aveva €284,99 per errore). Match Stripe `stripe_eu_tx_txn_3TSzMs…` **esatto**.
- Isabella **non** nel lotto import (già a libro / pose mensili). Candidati: **33 · €1.667,02**.
- Amanda Favot: importo reale **€39,99** (`FF-PN-26-003`); €109,98 elenco .eu = errore → chiuso in `dossier_metodo_v16_indagine_punti_1_4.md`.

## Checksum .eu 2026 (titolare)

| | |
|---|---|
| Riportati .com (9) | €522,90 |
| Non riportati (34, incl. Isabella) | €1.951,92 |
| Totale .eu 2026 | **€2.474,82** |
| Isabella già a libro | €284,90 |
| **Importati** | **33 · €1.667,02** |

## Implementazione

- `lib/orders/importEuHistoricalOrder.ts` — percorso dedicato: `orderNumber=null`, `status=COMPLETED`, `confirmationMessageSent=true`, `createdAt` = data reale, tag `IMPORT_EU_HISTORICAL` + batch id, `stripeTransactionId` = TX gateway, link soft `StripeFinanceMovement.orderId` (no Prima Nota, no Vera/email).
- Script: `scripts/dry-run-import-eu-orders-2026.ts --apply`
- Fix post-apply: 13 PayPal avevano prefisso `TX:` su `stripeTransactionId` → strip per match registro (id nudo).

## Apply — risultato

| Metrica | Valore |
|--------|--------|
| Ordini creati | **33** |
| Skip | 0 |
| Righe `OrderItem` | **47** |
| Batch | `EU_HIST_20260910_A` (reversibile via tag) |

## prepaidSubscriptionOrders ↔ Isabella / carnet

- Le pose mensili FT-MC-26-00x (`isRecurring`, senza `stripeTransactionId`) restano **esclusi** correttamente da corrispettivi/ricavi (`isPrepaidSubscriptionPoseOrder` = true).
- L’incasso Stripe EU **€284,90** del 03/05 **non** è filtrato da quella regola (opera sugli Order-posa, non sul movimento gateway).
- Oggi il movimento ha ancora `orderId=null` e FT-MC-26-001 (carnet €299,90) è soft-deleted senza TX → in registro resta **MANCANTE** finché non si collega un ordine “pagamento carnet” (fuori da questo lotto). Il rinvio competenza 2027 non giustifica escludere l’IVA sull’incasso: serve link ordine+aliquota 10% dedicato.

## MANCANTE post-apply (`buildGatewayCorrispettivi`)

| Trimestre | Mancante | Lordo | DETERMINATA | PRESUNTA | Gate 30% |
|-----------|----------|-------|-------------|----------|----------|
| **T1** | **1,8%** | €1.057,39 | €1.038,23 | €0 | **OK** |
| **T2** | **47,6%** | €1.801,88 | €628,79 | €314,89 | **BLOCCA** |
| **T3** | **49,8%** | €2.381,02 | €672,29 | €522,90 | **BLOCCA** |

**Lettura:** T1 sotto soglia → primo dossier T1 potenzialmente esportabile sul criterio MANCANTE. T2 ancora bloccato (rumore PayPal + incassi .com senza ordine + Isabella €284,90). T3 fuori perimetro di questo import.

## File

- `lib/orders/importEuHistoricalOrder.ts`
- `scripts/dry-run-import-eu-orders-2026.ts`
- `docs/verbali/dossier_metodo_v16_indagine_punti_1_4.md` (Amanda chiusa)
- questo verbale
