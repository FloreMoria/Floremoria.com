# Fase 2 — Correzione modello contabile (forward-looking)

**Data:** 2026-09-06  
**Opzione:** A — nessun UPDATE storico  
**Commit previsto:** `feat(finance): fase 2 — conti di transito gateway, partita esplicita, idempotenza su evento sorgente`

## Precondizioni

- Motore riconciliazione unico: `reconciler.ts` = re-export di `reconciliation.ts` (alias, non seconda pipeline).
- Webhook finance: `x-mock-provider` rifiutato (403); solo `FinecoBankProvider`.
- Cancello unico: `commitLedgerEntries` in `lib/financial/ledgerWriteGate.ts`. Dual-write JSON→Neon disabilitato (`ledgerStore` scrive solo file locale).

## Verifica collaterale (alias reconciler)

Webhook `/api/v1/finance/webhook` e azioni dashboard chiamano `reconcileTransaction` da `reconciliation.ts` (diretto o via re-export). Nessuna divergenza di firma: `reconciler.ts` non espone API diverse. Pipeline nuova = stessa funzione + classificazione payout dietro flag.

## 5a — Invarianti (identici prima/dopo; nessuna scrittura)

| Metrica | Valore |
|---------|--------|
| Ricavi lordi 2026 | € 10.800,25 (`1080025` cent) |
| Costi totali | € 12.984,96 (`1298496` cent) |
| IVA a debito | € 134,97 (`13497` cent) |
| `FinancialLedgerEntry` count | `1166` |
| Saldo banca calcolato | € 32.403,61 (`3240361` cent) |
| Stabile | **SÌ** |

## 5b — Delta atteso Fase 4 (sola lettura)

| | |
|--|--|
| Righe BANK_LINE oggi in ricavo con payout id abbinabile | **87** |
| Importo (TARGET riduzione ricavi Fase 4) | **€ 4.080,29** (`408029` cent) |
| IVA associata | `0` (queste BANK_LINE non portano vatCents) |
| Di cui in periodi IVA già liquidati (euristica Q < corrente) | **45** righe |

Per trimestre 2026:

| Periodo | Righe | Importo € | Liquidato? |
|---------|------:|----------:|:----------:|
| T1 | 17 | 791,26 | sì |
| T2 | 28 | 1.378,85 | sì |
| T3 | 42 | 1.910,18 | no |

## 5c — Dry-run modello nuovo

| Test | Esito |
|------|-------|
| ≥5 payout id → TRANSITO Dare Fineco / Avere Banca c/o Gateway | PASS (8) |
| ≥3 STRIPE/PAYPAL senza payout id → DA_CLASSIFICARE (mai ricavi) | PASS (2 reali Neon + 1 sintetico; in DB solo 2 candidati) |
| ≥3 ordinari senza gateway | PASS (3) |
| Re-process SKIP + reject sourceKey `:v…` | PASS |

Flag: `FINANCE_PAYOUT_ID_CLASSIFICATION` (default ON; off con `0`/`false`/`off`).

## 5d — Saldo conti di transito (baseline)

| | Ledger transit (cent) | Gateway real | Delta |
|--|--:|--|--|
| Stripe (10300) | 44613 (€ 446,13) | n/d (API key test scaduta) | n/d |
| PayPal (10200) | -156830 (€ -1.568,30) | n/d (API non wireata) | n/d |

Endpoint debug: `GET /api/dashboard/finance/gateway-transit-balance`

## Artefatti

- `lib/financial/ledgerWriteGate.ts`
- `lib/financial/payoutClassification.ts`
- `lib/financial/chartOfAccounts.ts`
- `lib/financial/gatewayTransitBalance.ts`
- Colonne NULLABLE: `entry_nature`, `settlement_status`, `matched_entry_id`, `matched_bank_line_id`
- Script: `npx tsx scripts/fase2-acceptance.ts`
