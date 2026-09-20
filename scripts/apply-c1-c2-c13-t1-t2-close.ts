/**
 * Apply: (1) storno doppi BANK_LINE ledger T2
 *         (2) SDD Fineco→PayPal: dare 10200 (funding reale, riga per riga)
 *         (3) Stripe: se esiste fee/movimento reale che chiude Δ€38,15 lo collega; altrimenti report
 *         (4) persist C1–C14 T1/T2
 *
 * Uso: npx tsx scripts/apply-c1-c2-c13-t1-t2-close.ts --apply
 */
import { loadEnvFiles } from '@/lib/loadEnvFiles';
loadEnvFiles();
if (process.env.DATABASE_URL_UNPOOLED?.trim()) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED.trim();
}

import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import {
    LEDGER_FINECO_ACCOUNT,
    LEDGER_PAYPAL_ACCOUNT,
    LEDGER_STRIPE_ACCOUNT,
} from '@/lib/financial/companyBankDetails';
import {
    controlC1,
    controlC2,
    controlC13,
    runAndPersistDossierControls,
} from '@/lib/financial/dossierFiscalControls';
import {
    sumPaypalPaymentAccountCents,
    sumStripeSalesTransitCents,
} from '@/lib/financial/gatewayTransitBalance';
import {
    getPaypalDeclaredBalance,
    getStripeDeclaredBalance,
} from '@/lib/financial/gatewayDeclaredBalance';
import { summarizeControls } from '@/lib/financial/dossierControlsStore';

const APPLY = process.argv.includes('--apply');
const BATCH = 'C1_C2_C13_T1T2_20260918';

function euro(c: number) {
    return +(c / 100).toFixed(2);
}

async function reverseDuplicateBankLedger() {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: { in: ['BANK_LINE', 'BANK_LINE_MANUAL'] },
        },
        select: {
            id: true,
            sourceKey: true,
            sourceId: true,
            bankLineId: true,
            totalCents: true,
            createdAt: true,
            description: true,
            metadataJson: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    const byBank = new Map<string, typeof rows>();
    for (const r of rows) {
        const bid =
            r.bankLineId ||
            r.sourceId ||
            (r.sourceKey.startsWith('BANK_LINE:') ? r.sourceKey.slice(10) : '');
        if (!bid) continue;
        const list = byBank.get(bid) || [];
        list.push(r);
        byBank.set(bid, list);
    }

    const reversed: Array<{ keepId: string; removeId: string; bankId: string; euro: number }> =
        [];
    for (const [bankId, list] of byBank) {
        if (list.length < 2) continue;
        const keep = list[0];
        for (const rem of list.slice(1)) {
            if (APPLY) {
                const prevMeta =
                    rem.metadataJson && typeof rem.metadataJson === 'object'
                        ? (rem.metadataJson as Record<string, unknown>)
                        : {};
                await prisma.financialLedgerEntry.update({
                    where: { id: rem.id },
                    data: {
                        reversedAt: new Date(),
                        metadataJson: {
                            ...prevMeta,
                            reversedByBatch: BATCH,
                            reversedReason: 'duplicate BANK_LINE same bankStatementLine id',
                            keeperEntryId: keep.id,
                        },
                    },
                });
            }
            reversed.push({
                keepId: keep.id,
                removeId: rem.id,
                bankId,
                euro: euro(rem.totalCents),
            });
        }
    }
    return reversed;
}

async function reclassPaypalSddFunding() {
    // Solo addebiti SDD Fineco verso PayPal (estratto reale)
    const bankLines = await prisma.bankStatementLine.findMany({
        where: {
            amountCents: { lt: 0 },
            description: { contains: 'PayPal', mode: 'insensitive' },
            OR: [
                { accountingDate: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') } },
                { valueDate: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') } },
            ],
        },
        select: {
            id: true,
            amountCents: true,
            accountingDate: true,
            description: true,
        },
    });

    const sddBank = bankLines.filter((b) =>
        /sdd|addebito\s*sdd|adde\s*bito\s*sdd|sepa/i.test(b.description)
    );

    const actions: Array<{
        bankId: string;
        ledgerId: string | null;
        euro: number;
        date: string | null;
        action: string;
    }> = [];

    let creditedCents = 0;

    for (const b of sddBank) {
        const ledger = await prisma.financialLedgerEntry.findFirst({
            where: {
                reversedAt: null,
                OR: [
                    { bankLineId: b.id },
                    { sourceKey: `BANK_LINE:${b.id}` },
                    { sourceId: b.id, sourceType: { in: ['BANK_LINE', 'BANK_LINE_MANUAL'] } },
                ],
            },
            select: {
                id: true,
                sourceKey: true,
                totalCents: true,
                category: true,
                metadataJson: true,
                description: true,
            },
        });

        if (!ledger) {
            actions.push({
                bankId: b.id,
                ledgerId: null,
                euro: euro(b.amountCents),
                date: b.accountingDate?.toISOString().slice(0, 10) || null,
                action: 'SKIP_NO_LEDGER',
            });
            continue;
        }

        const meta = (ledger.metadataJson || {}) as Record<string, unknown>;
        const dare = String(meta.dareAccount || '');
        const already =
            dare.includes('10200') ||
            dare.includes('PayPal') ||
            dare.includes('Banca c/o PayPal');

        if (already && meta.sddFundingBatch === BATCH) {
            actions.push({
                bankId: b.id,
                ledgerId: ledger.id,
                euro: euro(Math.abs(ledger.totalCents)),
                date: b.accountingDate?.toISOString().slice(0, 10) || null,
                action: 'ALREADY_OK',
            });
            creditedCents += Math.abs(ledger.totalCents);
            continue;
        }

        if (APPLY) {
            await prisma.financialLedgerEntry.update({
                where: { id: ledger.id },
                data: {
                    category: 'TRASFERIMENTO_INTERNO',
                    entryNature: 'TRANSITO',
                    metadataJson: {
                        ...meta,
                        // Provvista Fineco → PayPal: dare PayPal (+) / avere Fineco (−)
                        dareAccount: LEDGER_PAYPAL_ACCOUNT,
                        avereAccount: LEDGER_FINECO_ACCOUNT,
                        sddFundingBatch: BATCH,
                        priorDareAccount: meta.dareAccount || null,
                        priorCategory: ledger.category,
                        bankStatementLineId: b.id,
                        note: 'Versamento SDD Fineco→PayPal (alimenta 10200); non costo/ricavo — collegato a riga estratto',
                    },
                },
            });
        }

        creditedCents += Math.abs(b.amountCents);
        actions.push({
            bankId: b.id,
            ledgerId: ledger.id,
            euro: euro(Math.abs(b.amountCents)),
            date: b.accountingDate?.toISOString().slice(0, 10) || null,
            action: already ? 'RECLASS_ENSURE_10200' : 'RECLASS_17100_TO_10200',
        });
    }

    return { sddCount: sddBank.length, creditedCents, actions };
}

async function investigateStripeGap() {
    const [ledger, decl] = await Promise.all([
        sumStripeSalesTransitCents(2026),
        getStripeDeclaredBalance(),
    ]);
    const gap = (decl?.balanceCents ?? 0) - ledger;
    // Cerca fee/movimenti Stripe reali pari al gap (±1 cent)
    const candidates = await prisma.stripeFinanceMovement.findMany({
        where: {
            OR: [
                { feeCents: { in: [gap, -gap, Math.abs(gap)] } },
                { amountCents: { in: [gap, -gap, Math.abs(gap)] } },
                { netCents: { in: [gap, -gap, Math.abs(gap)] } },
            ],
        },
        select: {
            id: true,
            stripeId: true,
            type: true,
            amountCents: true,
            feeCents: true,
            netCents: true,
            createdAtStripe: true,
            description: true,
        },
        take: 20,
    });
    const ledgerHits = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            OR: [
                { totalCents: { in: [gap, -gap, Math.abs(gap), -Math.abs(gap)] } },
                { sourceKey: { startsWith: 'STRIPE_' } },
            ],
        },
        select: {
            id: true,
            sourceKey: true,
            totalCents: true,
            category: true,
            description: true,
        },
        take: 50,
    });
    const exactLedger = ledgerHits.filter(
        (r) => Math.abs(Math.abs(r.totalCents) - Math.abs(gap)) <= 1
    );

    return {
        ledgerEuro: euro(ledger),
        declaredEuro: decl ? euro(decl.balanceCents) : null,
        gapEuro: euro(gap),
        stripeMovementCandidates: candidates,
        exactLedgerHits: exactLedger,
        note:
            exactLedger.length === 0 && candidates.length === 0
                ? 'Nessun movimento Stripe/ledger con importo = gap €38,15 — non si genera scrittura forfettaria. Residuo da allineare su saldo dichiarato o sync API.'
                : 'Trovati candidati reali — verificare prima di scrivere.',
    };
}

async function main() {
    console.info('[c1-c2-c13] mode', APPLY ? 'APPLY' : 'DRY-RUN');

    const beforePp = await sumPaypalPaymentAccountCents();
    const beforeSt = await sumStripeSalesTransitCents(2026);

    const dups = await reverseDuplicateBankLedger();
    console.info('[c1-c2-c13] duplicate BANK_LINE reversed', dups.length);

    const sdd = await reclassPaypalSddFunding();
    console.info('[c1-c2-c13] SDD funding', {
        count: sdd.sddCount,
        creditedEuro: euro(sdd.creditedCents),
    });

    const stripeGap = await investigateStripeGap();

    const afterPp = await sumPaypalPaymentAccountCents();
    const afterSt = await sumStripeSalesTransitCents(2026);
    const [ppDecl, stDecl] = await Promise.all([
        getPaypalDeclaredBalance(),
        getStripeDeclaredBalance(),
    ]);

    // Persist controls T1/T2
    const controlsByQ: Record<string, unknown> = {};
    for (const q of [1, 2] as const) {
        const controls = APPLY
            ? await runAndPersistDossierControls(2026, q, { allowIncompleteVat: true })
            : await Promise.all([
                  controlC1(2026, q),
                  controlC2(2026, q),
                  controlC13(2026, q),
              ]);
        if (APPLY) {
            const summary = summarizeControls(controls as any);
            const c1 = (controls as any[]).find((c) => c.id === 'C1');
            const c2 = (controls as any[]).find((c) => c.id === 'C2');
            const c13 = (controls as any[]).find((c) => c.id === 'C13');
            controlsByQ[`T${q}`] = {
                summary,
                C1: { passed: c1?.passed, detail: c1?.detail, delta: c1?.delta },
                C2: {
                    passed: c2?.passed,
                    detail: c2?.detail,
                    deltaEuro: c2 ? euro(c2.delta) : null,
                },
                C13: {
                    passed: c13?.passed,
                    detail: c13?.detail,
                    deltaEuro: c13 ? euro(c13.delta) : null,
                },
                passed: summary.passed,
                failed: summary.failedCount,
                nv: summary.notVerifiableCount,
            };
        } else {
            const [c1, c2, c13] = controls as any[];
            controlsByQ[`T${q}`] = {
                C1: { passed: c1.passed, detail: c1.detail },
                C2: { passed: c2.passed, detail: c2.detail, deltaEuro: euro(c2.delta) },
                C13: { passed: c13.passed, detail: c13.detail, deltaEuro: euro(c13.delta) },
            };
        }
    }

    const report = {
        generatedAt: new Date().toISOString(),
        mode: APPLY ? 'apply' : 'dry-run',
        batch: BATCH,
        c1c2Fix:
            'Vista Fineco master: ripristino BANK_LINE collassate + divieto merge tra bankLineId distinti in consolidateAuthorityOutflows. Nessuna scrittura forfettaria.',
        duplicateBankLedgerReversed: dups,
        paypalSddFunding: {
            beforeEuro: euro(beforePp),
            afterEuro: euro(afterPp),
            declaredEuro: ppDecl ? euro(ppDecl.balanceCents) : null,
            creditedEuro: euro(sdd.creditedCents),
            sddCount: sdd.sddCount,
            actions: sdd.actions,
        },
        stripe: {
            beforeEuro: euro(beforeSt),
            afterEuro: euro(afterSt),
            declaredEuro: stDecl ? euro(stDecl.balanceCents) : null,
            investigation: stripeGap,
        },
        controls: controlsByQ,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    const base = path.join(
        process.cwd(),
        'docs',
        'verbali',
        `${stamp}-c1-c2-c13-t1-t2${APPLY ? '-apply' : '-dryrun'}`
    );
    fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2) + '\n');

    const md = [
        `# Chiusura C1 / C2 / C13 — T1–T2 2026`,
        '',
        `Mode: **${APPLY ? 'APPLY' : 'DRY-RUN'}** · ${report.generatedAt}`,
        '',
        '## Principio',
        '',
        'Nessun importo forfettario. Ogni scrittura è collegata a `bankStatementLine` o a movimento Stripe/PayPal esistente.',
        '',
        '## C1 / C2',
        '',
        report.c1c2Fix,
        '',
        '| Trimestre | C1 | C2 |',
        '|---|---|---|',
        ...([1, 2] as const).map((q) => {
            const c = (controlsByQ as any)[`T${q}`];
            return `| T${q} | ${c.C1?.passed ? 'PASS' : 'FAIL'} ${c.C1?.detail || ''} | ${c.C2?.passed ? 'PASS' : 'FAIL'} Δ€${c.C2?.deltaEuro ?? '?'} |`;
        }),
        '',
        `Doppioni BANK_LINE stornati: **${dups.length}**`,
        '',
        '## C13 PayPal — SDD Fineco → 10200',
        '',
        `- Prima: €${euro(beforePp)} · Dopo: €${euro(afterPp)} · Dichiarato: €${ppDecl ? euro(ppDecl.balanceCents) : 'n/d'}`,
        `- SDD riga-per-riga: ${sdd.sddCount} · credito imputato: €${euro(sdd.creditedCents)}`,
        '',
        '## C13 Stripe',
        '',
        `- Ledger: €${stripeGap.ledgerEuro} · Dichiarato: €${stripeGap.declaredEuro} · Gap: €${stripeGap.gapEuro}`,
        `- ${stripeGap.note}`,
        '',
        `JSON: \`${path.basename(base)}.json\``,
        '',
    ].join('\n');
    fs.writeFileSync(`${base}.md`, md);

    console.info('[c1-c2-c13] DONE', {
        out: base,
        dups: dups.length,
        sdd: sdd.sddCount,
        pp: { before: euro(beforePp), after: euro(afterPp) },
        controls: controlsByQ,
    });
}

main()
    .catch((e) => {
        console.error('[c1-c2-c13] FAIL', e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
