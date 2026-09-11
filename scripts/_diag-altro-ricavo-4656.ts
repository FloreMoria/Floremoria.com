import prisma from '@/lib/prisma';

async function main() {
  // Bank lines ~4597 or OTHER_REVENUE / match notes
  const lines = await prisma.bankStatementLine.findMany({
    where: {
      OR: [
        { amountCents: { gte: 450000, lte: 470000 } },
        { amountCents: { gte: -470000, lte: -450000 } },
        { matchType: { contains: 'OTHER' } },
        { matchType: { contains: 'REVENUE' } },
        { matchType: { contains: 'GIRO' } },
        { description: { contains: 'soci', mode: 'insensitive' } },
        { description: { contains: 'capitale', mode: 'insensitive' } },
        { description: { contains: 'versamento', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      amountCents: true,
      accountingDate: true,
      description: true,
      matchType: true,
      matchNotes: true,
      matchStatus: true,
      rawJson: true,
    },
    orderBy: { amountCents: 'desc' },
    take: 50,
  });
  console.log('lines', lines.length);
  for (const l of lines) {
    console.log(
      JSON.stringify({
        date: l.accountingDate?.toISOString().slice(0, 10),
        euro: l.amountCents / 100,
        matchType: l.matchType,
        status: l.matchStatus,
        desc: l.description.slice(0, 200),
        notes: (l.matchNotes || '').slice(0, 120),
      })
    );
  }

  // Sum OTHER_REVENUE matched
  const other = await prisma.bankStatementLine.findMany({
    where: {
      OR: [
        { matchType: 'OTHER_REVENUE' },
        { matchType: { equals: 'OTHER_REVENUE' } },
      ],
    },
    select: { amountCents: true, accountingDate: true, description: true, matchType: true },
  });
  console.log(
    'OTHER_REVENUE n',
    other.length,
    'sum',
    other.reduce((s, r) => s + r.amountCents, 0) / 100
  );

  // Search ledger for ~459766
  const led = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      OR: [
        { totalCents: { gte: 450000, lte: 470000 } },
        { totalCents: { lte: -450000, gte: -470000 } },
        { totalCents: { gte: 465000, lte: 466000 } },
      ],
    },
    select: {
      sourceKey: true,
      category: true,
      totalCents: true,
      accountingDate: true,
      description: true,
      counterpartyName: true,
    },
  });
  console.log('ledger big', led);

  // All positive bank lines T1 sorted
  const t1 = await prisma.bankStatementLine.findMany({
    where: {
      amountCents: { gt: 100000 },
      accountingDate: { gte: new Date('2026-01-01'), lt: new Date('2026-04-01') },
    },
    select: {
      amountCents: true,
      accountingDate: true,
      description: true,
      matchType: true,
    },
    orderBy: { amountCents: 'desc' },
    take: 20,
  });
  console.log('T1 big credits:');
  for (const l of t1) {
    console.log(
      l.accountingDate?.toISOString().slice(0, 10),
      (l.amountCents / 100).toFixed(2),
      l.matchType,
      l.description.slice(0, 160)
    );
  }

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
