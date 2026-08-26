/**
 * Diagnosi sbilancio Fineco −15,72 €.
 *
 * Uso:
 *   npx tsx scripts/diagnose-fineco-gap-1572.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import prisma from '../lib/prisma';
import { computeFinanceQuadratura } from '../lib/financial/financeQuadratura';

function euro(cents: number | null | undefined): string {
    if (cents == null) return 'n/d';
    const sign = cents < 0 ? '−' : '';
    return `${sign}${(Math.abs(cents) / 100).toFixed(2)} €`;
}

function iso(d: Date | null | undefined): string {
    return d ? d.toISOString().slice(0, 10) : 'n/d';
}

async function main() {
    console.log('\n========== DIAGNOSI FINECO GAP −15,72 € ==========\n');

    const quad = await computeFinanceQuadratura();
    console.log('— Quadratura dashboard —');
    console.log(
        JSON.stringify(
            {
                realBalance: euro(quad.realBalanceCents),
                calculatedBalance: euro(quad.calculatedBalanceCents),
                openingBalance: euro(quad.openingBalanceCents),
                statementClosing: euro(quad.statementClosingCents),
                movementsSum: euro(quad.movementsSumCents),
                diffRealVsCalc: euro(quad.balanceDiffCents),
            },
            null,
            2
        )
    );

    const gapTarget = -1572;
    const absGap = 1572;

    // 1) Ricerca diretta importi
    const exactCents = [1572, -1572, 786, -786, 855, -855, 695, -695, 1550, -1550, 394, -394];
    const exactHits = await prisma.bankStatementLine.findMany({
        where: { amountCents: { in: exactCents } },
        orderBy: [{ accountingDate: 'asc' }, { lineIndex: 'asc' }],
        include: {
            document: {
                select: {
                    fileName: true,
                    periodStart: true,
                    periodEnd: true,
                    openingBalanceCents: true,
                    closingBalanceCents: true,
                },
            },
        },
    });

    console.log('\n— 1) Hit importi target (15,72 / 7,86 / 8,55 / 6,95 / …) —');
    if (!exactHits.length) {
        console.log('(nessuna riga con questi importi esatti in bank_statement_lines)');
    }
    for (const h of exactHits) {
        console.log(
            `${iso(h.accountingDate)}  ${euro(h.amountCents).padStart(12)}  saldoRiga=${euro(h.balanceCents)}  ${h.description.slice(0, 90)}  [${h.document.fileName}]`
        );
    }

    const nearHits = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { amountCents: { gte: 1400, lte: 1700 } },
                { amountCents: { gte: -1700, lte: -1400 } },
            ],
        },
        orderBy: [{ accountingDate: 'asc' }],
        select: {
            id: true,
            accountingDate: true,
            amountCents: true,
            description: true,
            balanceCents: true,
        },
    });
    console.log('\n— Vicini ±14,00…17,00 € —');
    for (const h of nearHits) {
        console.log(
            `${iso(h.accountingDate)}  ${euro(h.amountCents).padStart(12)}  ${h.description.slice(0, 100)}`
        );
    }

    // Pattern tipici
    const patternHits = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { description: { contains: 'bollo', mode: 'insensitive' } },
                { description: { contains: 'canone', mode: 'insensitive' } },
                { description: { contains: 'commiss', mode: 'insensitive' } },
                { description: { contains: 'google', mode: 'insensitive' } },
                { description: { contains: 'workspace', mode: 'insensitive' } },
                { description: { contains: 'dominio', mode: 'insensitive' } },
                { description: { contains: 'pos', mode: 'insensitive' } },
            ],
            accountingDate: {
                gte: new Date('2026-06-01T00:00:00.000Z'),
                lt: new Date('2026-09-01T00:00:00.000Z'),
            },
        },
        orderBy: [{ accountingDate: 'asc' }],
        select: {
            accountingDate: true,
            amountCents: true,
            description: true,
        },
    });
    console.log('\n— 2) Pattern tipici Giu–Ago 2026 (bollo/canone/commissioni/SaaS) —');
    for (const h of patternHits) {
        console.log(
            `${iso(h.accountingDate)}  ${euro(h.amountCents).padStart(12)}  ${h.description.slice(0, 110)}`
        );
    }

    // Documenti con saldi ufficiali
    const docs = await prisma.bankStatementDocument.findMany({
        where: {
            OR: [
                { openingBalanceCents: { not: null } },
                { closingBalanceCents: { not: null } },
            ],
        },
        orderBy: [{ periodEnd: 'asc' }, { periodStart: 'asc' }],
        select: {
            id: true,
            fileName: true,
            periodStart: true,
            periodEnd: true,
            openingBalanceCents: true,
            closingBalanceCents: true,
            _count: { select: { lines: true } },
        },
    });
    console.log('\n— Documenti con saldo apertura/chiusura —');
    for (const d of docs) {
        console.log(
            `${d.fileName}  ${iso(d.periodStart)}→${iso(d.periodEnd)}  open=${euro(d.openingBalanceCents)}  close=${euro(d.closingBalanceCents)}  lines=${d._count.lines}`
        );
    }

    // 3) Running balance su TUTTI i movimenti
    const allLines = await prisma.bankStatementLine.findMany({
        orderBy: [
            { accountingDate: 'asc' },
            { valueDate: 'asc' },
            { lineIndex: 'asc' },
            { id: 'asc' },
        ],
        select: {
            id: true,
            accountingDate: true,
            valueDate: true,
            amountCents: true,
            balanceCents: true,
            description: true,
            documentId: true,
        },
    });

    const opening = quad.openingBalanceCents;
    let running = opening ?? 0;
    console.log(
        `\n— 3) Running balance (partenza apertura ${euro(opening)}; movimenti=${allLines.length}) —`
    );

    type Row = (typeof allLines)[number] & { runningAfter: number; bankBal: number | null };
    const rows: Row[] = [];
    let firstBankDivergDate: string | null = null;
    let firstBankDivergRow: Row | null = null;

    for (const l of allLines) {
        running += l.amountCents;
        const row: Row = { ...l, runningAfter: running, bankBal: l.balanceCents };
        rows.push(row);
        if (l.balanceCents != null) {
            const delta = running - l.balanceCents;
            if (Math.abs(delta) === absGap || Math.abs(delta - gapTarget) < 1) {
                if (!firstBankDivergDate) {
                    firstBankDivergDate = iso(l.accountingDate);
                    firstBankDivergRow = row;
                }
            }
        }
    }

    // Confronta chiusura progressiva fine mese vs documento
    const monthEnds = [
        { label: '2026-07', end: '2026-07-31' },
        { label: '2026-08', end: '2026-08-31' },
    ];
    console.log('\n— Saldo progressivo a fine mese vs documenti —');
    for (const m of monthEnds) {
        const last = [...rows].reverse().find((r) => {
            const d = iso(r.accountingDate);
            return d !== 'n/d' && d <= m.end;
        });
        const doc = docs.find((d) => {
            const pe = iso(d.periodEnd);
            return pe.startsWith(m.label) || (pe >= `${m.label}-01` && pe <= m.end);
        });
        const calc = last?.runningAfter ?? null;
        const official = doc?.closingBalanceCents ?? null;
        const delta = calc != null && official != null ? calc - official : null;
        console.log(
            `${m.label}: calc=${euro(calc)}  ufficiale=${euro(official)}  delta=${euro(delta)}  lastMove=${iso(last?.accountingDate)}`
        );
    }

    // Cerca prima data in cui running - bankBal == ±1572
    console.log('\n— Prima divergenza running vs saldo riga banca (±15,72) —');
    let found = false;
    for (const r of rows) {
        if (r.bankBal == null) continue;
        const delta = r.runningAfter - r.bankBal;
        if (Math.abs(delta) === absGap) {
            console.log(
                `DATA=${iso(r.accountingDate)}  delta=${euro(delta)}  amount=${euro(r.amountCents)}  running=${euro(r.runningAfter)}  bankBal=${euro(r.bankBal)}`
            );
            console.log(`  desc: ${r.description.slice(0, 140)}`);
            console.log(`  id: ${r.id}`);
            found = true;
            break;
        }
    }
    if (!found) {
        console.log('(nessuna riga con balanceCents diverge esattamente di 15,72)');
        // Mostra prime divergenze qualsiasi
        let shown = 0;
        for (const r of rows) {
            if (r.bankBal == null) continue;
            const delta = r.runningAfter - r.bankBal;
            if (Math.abs(delta) >= 1) {
                console.log(
                    `  prima divergenza generica: ${iso(r.accountingDate)} delta=${euro(delta)} amount=${euro(r.amountCents)} ${r.description.slice(0, 80)}`
                );
                shown += 1;
                if (shown >= 5) break;
            }
        }
    }

    // Differenza quadratura vs target
    const diff = quad.balanceDiffCents;
    console.log('\n— 4) Ipotesi sanatoria —');
    console.log(`diff reale−calcolato = ${euro(diff)}`);
    if (diff === gapTarget || diff === absGap || diff === -absGap) {
        console.log('→ Lo sbilancio dashboard coincide con ±15,72 €.');
    }

    // Candidati: movimento mancante −15,72 (se calc > reale di 15,72, manca un addebito)
    // Se reale − calcolato = −15,72 → calcolato è più alto di 15,72 → manca un'uscita di 15,72
    // oppure c'è un'entrata in più / segno invertito +7,86 invece di −7,86
    if (diff === gapTarget) {
        console.log(
            'Interpretazione: saldo LIBRO (calcolato) superiore al REALE di 15,72 € → tipicamente MANCA un ADDEBITO di 15,72 € oppure un movimento è stato registrato con segno + invece di − (gap 2×importo).'
        );
    }

    // Segno invertito: cerca +7,86
    const plus786 = exactHits.filter((h) => h.amountCents === 786);
    const minus786 = exactHits.filter((h) => h.amountCents === -786);
    if (plus786.length) {
        console.log('\nCandidati SEGNO INVERTITO (+7,86):');
        for (const h of plus786) {
            console.log(
                `  ${iso(h.accountingDate)} +7,86  id=${h.id}  → sanare a −7,86 (delta netto −15,72)`
            );
            console.log(`  SQL:`);
            console.log(
                `  UPDATE bank_statement_lines SET amount_cents = -786, debit_cents = 786, credit_cents = NULL WHERE id = '${h.id}';`
            );
        }
    } else {
        console.log('\nNessun +7,86 € in tabella (ipotesi segno invertito su 7,86 non supportata dai dati).');
    }
    if (minus786.length) {
        console.log(`Trovati ${minus786.length} movimenti −7,86 € (ok se attesi).`);
    }

    const missing1572 = exactHits.filter((h) => Math.abs(h.amountCents) === 1572);
    if (!missing1572.length) {
        console.log(
            '\nNessun movimento ±15,72 € in DB → il gap è probabilmente un MOVIMENTO MANCANTE (non ancora parsato) oppure somma di micro-errori.'
        );
        console.log('Prisma insert di sanatoria (esempio, da adattare a data reale):');
        console.log(`
await prisma.bankStatementLine.create({
  data: {
    documentId: '<docId-paste-o-pdf>',
    lineIndex: 9999,
    accountingDate: new Date('2026-08-XXT12:00:00.000Z'),
    valueDate: new Date('2026-08-XXT12:00:00.000Z'),
    description: 'TODO: causale ufficiale Fineco da estratto',
    amountCents: -1572,
    debitCents: 1572,
    creditCents: null,
    matchStatus: 'UNMATCHED',
    fingerprint: 'manual-gap-1572-' + Date.now(),
  },
});
`);
    }

    // Ultimi 15 movimenti agosto per ispezione
    console.log('\n— Ultimi movimenti Ago 2026 (coda) —');
    const aug = rows.filter((r) => iso(r.accountingDate).startsWith('2026-08'));
    for (const r of aug.slice(-20)) {
        console.log(
            `${iso(r.accountingDate)} ${euro(r.amountCents).padStart(12)} run=${euro(r.runningAfter).padStart(12)} bank=${euro(r.bankBal)}  ${r.description.slice(0, 70)}`
        );
    }

    // 5) Allineamento saldo reale vs movimenti successivi
    const { getFinecoManualBalance } = await import('../lib/financial/finecoBalance');
    const manual = await getFinecoManualBalance();
    if (manual) {
        const alignedDay = manual.alignedAt.slice(0, 10);
        const afterAligned = await prisma.bankStatementLine.findMany({
            where: {
                accountingDate: { gt: new Date(`${alignedDay}T23:59:59.999Z`) },
            },
            orderBy: [{ accountingDate: 'asc' }, { id: 'asc' }],
            select: {
                id: true,
                accountingDate: true,
                amountCents: true,
                description: true,
                document: { select: { fileName: true } },
            },
        });
        const netAfter = afterAligned.reduce((s, r) => s + r.amountCents, 0);
        console.log('\n— 5) VERDETTO: saldo reale vs movimenti successivi all’allineamento —');
        console.log(`Saldo reale allineato il ${manual.alignedAt} = ${euro(manual.balanceCents)}`);
        console.log(
            `Movimenti in DB con data > ${alignedDay}: ${afterAligned.length} righe, netto ${euro(netAfter)}`
        );
        for (const r of afterAligned) {
            console.log(
                `  ${iso(r.accountingDate)} ${euro(r.amountCents).padStart(10)}  ${r.description.slice(0, 85)}`
            );
            console.log(`    id=${r.id}  file=${r.document.fileName}`);
        }
        if (netAfter === absGap || netAfter === -absGap || netAfter === gapTarget || Math.abs(netAfter) === absGap) {
            console.log('\n★ CAUSA DEL GAP −15,72 €:');
            console.log(
                `  Il saldo REALE (${euro(manual.balanceCents)}) è fermo al ${alignedDay}, mentre il LIBRO include i movimenti successivi con netto ${euro(netAfter)}.`
            );
            console.log('  Non risulta un singolo movimento ±15,72 € mancante o un +7,86 con segno invertito.');
            console.log('\n  SANATORIA consigliata (scegliere UNA):');
            console.log(
                `  A) Aggiornare il saldo reale Fineco in dashboard a ${euro(manual.balanceCents + netAfter)} (se l’home banking conferma quel totale).`
            );
            console.log(
                '  B) Se l’home banking mostra ancora il saldo del ' +
                    alignedDay +
                    ', verificare/eliminare le 4 righe post-allineamento (una di esse o il loro netto non è sul conto reale).'
            );
            console.log('\n  Prisma — aggiornamento saldo reale (opzione A):');
            console.log(`
import { setFinecoManualBalance } from '@/lib/financial/finecoBalance';
await setFinecoManualBalance({
  balanceCents: ${manual.balanceCents + netAfter},
  note: 'Riallineamento post-diagnosi gap 15,72 (movimenti dopo ${alignedDay})',
});
`);
        }
    }

    if (firstBankDivergRow) {
        console.log('\n(prima riga con |Δ|=15,72 vs balanceCents banca già stampata sopra)');
    }

    console.log('\n========== FINE DIAGNOSI ==========\n');
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
