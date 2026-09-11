/**
 * Chiude Δ €219,24 payout ledger vs Fineco:
 * - storno po_ 10/09 €297,85 (in ledger, assente da estratto)
 * - inserisce 2 STRIPE_PAYOUT presenti su Fineco e in Stripe API ma mai a libro
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';
import {
    LEDGER_FINECO_ACCOUNT,
    LEDGER_STRIPE_ACCOUNT,
} from '@/lib/financial/companyBankDetails';

const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-payout-fineco-close.json');
const BATCH = 'PAYOUT_FINECO_CLOSE_20260911';

function euro(c: number) {
  return Math.round(c) / 100;
}

async function main() {
  const apply = process.env.APPLY === '1';
  const log: any[] = [];

  // 1) Storno payout ledger assente da Fineco
  const ghost = await prisma.financialLedgerEntry.findFirst({
    where: {
      reversedAt: null,
      sourceKey: 'STRIPE_PAYOUT:po_1UDvan4W4pZWhSUsge2pRPub',
    },
  });
  if (ghost) {
    if (apply) {
      await prisma.financialLedgerEntry.update({
        where: { id: ghost.id },
        data: {
          reversedAt: new Date(),
          metadataJson: {
            ...((ghost.metadataJson || {}) as object),
            reverseBatch: BATCH,
            reverseReason:
              'Assente da estratto Fineco 11/09 (payout Stripe non ancora accreditato) — vince Fineco',
          },
          description: `[STORNO ${BATCH} — non in Fineco] ${ghost.description || ''}`.slice(0, 500),
        },
      });
    }
    log.push({
      action: 'reverse_ledger_absent_from_fineco',
      po: 'po_1UDvan4W4pZWhSUsge2pRPub',
      euro: euro(Math.abs(ghost.totalCents)),
      date: ghost.accountingDate.toISOString().slice(0, 10),
      apply,
    });
  }

  // 2) Inserisci payout Fineco presenti, mancanti a libro
  const missing = [
    {
      po: 'po_1TbsDK4W4pZWhSUsHr2btVRJ',
      cents: 3087,
      date: new Date('2026-05-28T00:54:22.000Z'),
    },
    {
      po: 'po_1Tv5P44W4pZWhSUsbKJdN3rS',
      cents: 4774,
      date: new Date('2026-07-20T00:49:54.000Z'),
    },
  ];
  const candidates = [];
  for (const m of missing) {
    const existing = await prisma.financialLedgerEntry.findFirst({
      where: { sourceKey: `STRIPE_PAYOUT:${m.po}` },
    });
    if (existing && !existing.reversedAt) {
      log.push({ action: 'skip_already_present', po: m.po, euro: euro(m.cents) });
      continue;
    }
    candidates.push({
      sourceKey: `STRIPE_PAYOUT:${m.po}`,
      sourceType: 'STRIPE_MOVEMENT' as const,
      sourceId: m.po.slice(0, 128),
      direction: 'USCITA' as const,
      category: 'TRASFERIMENTO_INTERNO' as const,
      accountingDate: m.date,
      description: `Payout Stripe → Fineco — ${m.po} [${BATCH}]`,
      counterpartyName: 'FinecoBank',
      netCents: -m.cents,
      vatRate: 0,
      vatCents: 0,
      totalCents: -m.cents,
      reconciliationStatus: 'MATCHED' as const,
      documentRef: m.po,
      entryNature: 'TRANSITO' as const,
      settlementStatus: 'MATCHED' as const,
      metadataJson: {
        type: 'payout',
        payoutId: m.po,
        dareAccount: LEDGER_FINECO_ACCOUNT,
        avereAccount: LEDGER_STRIPE_ACCOUNT,
        transitLeg: 'payout_to_bank',
        finecoBatch: BATCH,
      },
    });
    log.push({ action: 'insert_missing_fineco_payout', po: m.po, euro: euro(m.cents), apply });
  }
  if (apply && candidates.length) {
    const r = await appendLedgerEntries(candidates);
    log.push({ inserted: r.inserted, skipped: r.skipped });
  }

  const payouts = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      sourceKey: { startsWith: 'STRIPE_PAYOUT:po_' },
    },
    select: { totalCents: true },
  });
  const ledgerEuro = euro(payouts.reduce((s, p) => s + Math.abs(p.totalCents), 0));

  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    log,
    after: {
      ledgerPayoutEuro: ledgerEuro,
      finecoRefEuro: 2878.26,
      deltaEuro: Math.round((ledgerEuro - 2878.26) * 100) / 100,
    },
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
