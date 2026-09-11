/**
 * Payout Stripe ledger vs accrediti Fineco: elenca ledger assenti dall'estratto.
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';

const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-diag-payout-fineco-delta.json');

function euro(c: number) {
  return Math.round(c) / 100;
}
function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function main() {
  const payouts = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      sourceKey: { startsWith: 'STRIPE_PAYOUT:po_' },
    },
    select: {
      id: true,
      sourceKey: true,
      totalCents: true,
      accountingDate: true,
      description: true,
      documentRef: true,
      metadataJson: true,
    },
    orderBy: { accountingDate: 'asc' },
  });

  // Fineco credits that look like Stripe payouts
  const bank = await prisma.bankStatementLine.findMany({
    where: {
      amountCents: { gt: 0 },
      accountingDate: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
      OR: [
        { description: { contains: 'Stripe', mode: 'insensitive' } },
        { description: { contains: 'STRIPE', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      amountCents: true,
      accountingDate: true,
      description: true,
      matchType: true,
      matchedTxId: true,
    },
    orderBy: { accountingDate: 'asc' },
  });

  // Also any credit matching payout amounts even without Stripe in text
  const allCredits = await prisma.bankStatementLine.findMany({
    where: {
      amountCents: { gt: 0 },
      accountingDate: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
    },
    select: {
      id: true,
      amountCents: true,
      accountingDate: true,
      description: true,
      matchType: true,
      matchedTxId: true,
    },
  });

  const usedBank = new Set<string>();
  const matched: any[] = [];
  const unmatchedLedger: any[] = [];

  for (const p of payouts) {
    const abs = Math.abs(p.totalCents);
    const po = p.documentRef || p.sourceKey.replace('STRIPE_PAYOUT:', '');
    const day = p.accountingDate.toISOString().slice(0, 10);
    // Match: same amount ±1c, date ±5d, prefer Stripe description or matchedTxId
    const cands = allCredits.filter((b) => {
      if (usedBank.has(b.id)) return false;
      if (Math.abs(b.amountCents - abs) > 1) return false;
      const bd = b.accountingDate?.toISOString().slice(0, 10) || '';
      if (!bd) return false;
      const dd =
        Math.abs(new Date(bd + 'T12:00:00Z').getTime() - p.accountingDate.getTime()) / 86400000;
      return dd <= 7;
    });
    // Prefer Stripe-named
    cands.sort((a, b) => {
      const as = /stripe/i.test(a.description) ? 0 : 1;
      const bs = /stripe/i.test(b.description) ? 0 : 1;
      return as - bs;
    });
    const hit = cands[0];
    if (hit) {
      usedBank.add(hit.id);
      matched.push({
        po,
        ledgerEuro: euro(abs),
        ledgerDate: day,
        bankEuro: euro(hit.amountCents),
        bankDate: hit.accountingDate?.toISOString().slice(0, 10),
        bankDesc: hit.description.slice(0, 100),
        bankId: hit.id,
      });
    } else {
      unmatchedLedger.push({
        id: p.id,
        po,
        sourceKey: p.sourceKey,
        euro: euro(abs),
        date: day,
        description: (p.description || '').slice(0, 140),
      });
    }
  }

  const stripeBankSum = bank.reduce((s, b) => s + b.amountCents, 0);
  const matchedSum = matched.reduce((s, m) => s + Math.round(m.ledgerEuro * 100), 0);
  const unmatchedSum = unmatchedLedger.reduce((s, m) => s + Math.round(m.euro * 100), 0);
  const ledgerSum = payouts.reduce((s, p) => s + Math.abs(p.totalCents), 0);

  // Bank Stripe credits not matched to a po_
  const unusedStripeBank = bank.filter((b) => !usedBank.has(b.id));

  const report = {
    generatedAt: new Date().toISOString(),
    finecoRefEuro: 2878.26,
    ledgerPayoutEuro: euro(ledgerSum),
    deltaEuro: euro(ledgerSum - 287826),
    stripeNamedBankEuro: euro(stripeBankSum),
    stripeNamedBankN: bank.length,
    matched: { n: matched.length, euro: euro(matchedSum), rows: matched },
    unmatchedLedger: {
      n: unmatchedLedger.length,
      euro: euro(unmatchedSum),
      rows: unmatchedLedger,
    },
    unusedStripeBank: unusedStripeBank.map((b) => ({
      id: b.id,
      euro: euro(b.amountCents),
      date: b.accountingDate?.toISOString().slice(0, 10),
      desc: b.description.slice(0, 120),
    })),
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
