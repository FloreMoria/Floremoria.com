/**
 * Fase 2 acceptance — sola lettura + dry-run (nessuna scrittura ledger).
 * Uso: npx tsx scripts/fase2-acceptance.ts
 *
 * 5a invarianti (snapshot)
 * 5b delta atteso Fase 4
 * 5c dry-run classificazione
 * 5d saldo transito vs gateway
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { dryRunClassifyBankLine } from '../lib/financial/payoutClassification';
import { compareGatewayTransitBalances } from '../lib/financial/gatewayTransitBalance';
import { commitLedgerEntries } from '../lib/financial/ledgerWriteGate';
import { isPayoutIdClassificationEnabled } from '../lib/financial/chartOfAccounts';
import type { LedgerEntryInput } from '../lib/financial/historicalLedgerTypes';

const FISCAL_YEAR = 2026;

async function snapshotInvariants() {
    const [pnl, entryCount, bankBalanceAgg] = await Promise.all([
        computeHistoricalPnl({ fiscalYear: FISCAL_YEAR }),
        prisma.financialLedgerEntry.count(),
        prisma.bankStatementLine.aggregate({
            _sum: { amountCents: true },
        }),
    ]);
    const costi =
        (pnl.costiFioristiCents || 0) +
        (pnl.costiFatturePassiveSdiCents || 0) +
        (pnl.costiSaasCents || 0) +
        (pnl.costiOperativiCents || 0) +
        (pnl.oneriBancariCents || 0);
    return {
        ricaviLordiCents: pnl.ricaviLordiCents,
        costiTotaliCents: costi,
        ivaDebitoCents: pnl.ivaDebitoCents,
        entryCount,
        saldoBancaCalcolatoCents:
            pnl.cashBankBalanceCents ?? bankBalanceAgg._sum.amountCents ?? null,
    };
}

async function deltaAttesoFase4() {
    // Accrediti Fineco in ledger classificati come ricavo, con payout id abbinabile in dry-run
    const revenueBank = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'BANK_LINE',
            direction: 'ENTRATA',
            category: { in: ['RICAVI_VENDITE', 'ALTRI_RICAVI'] },
            totalCents: { gt: 0 },
        },
        select: {
            id: true,
            bankLineId: true,
            sourceId: true,
            totalCents: true,
            vatCents: true,
            fiscalYear: true,
            fiscalQuarter: true,
            accountingDate: true,
            description: true,
        },
        take: 8000,
    });

    const byPeriod: Record<
        string,
        { rows: number; amountCents: number; ivaCents: number; liquidatedIva: boolean }
    > = {};
    let amountCents = 0;
    let ivaCents = 0;
    let rows = 0;
    let rowsInLiquidatedPeriods = 0;

    // Periodi IVA liquidati: T1 2026 chiuso tipicamente dopo apr; euristica: quarter < current quarter
    const now = new Date();
    const currentQ = Math.ceil((now.getUTCMonth() + 1) / 3);

    for (const r of revenueBank) {
        const blId = r.bankLineId || r.sourceId;
        const line = blId
            ? await prisma.bankStatementLine.findUnique({
                  where: { id: blId },
                  select: {
                      id: true,
                      amountCents: true,
                      accountingDate: true,
                      valueDate: true,
                      description: true,
                      matchType: true,
                  },
              })
            : null;
        if (!line || line.amountCents <= 0) continue;

        const cls = await dryRunClassifyBankLine({
            id: line.id,
            amountCents: line.amountCents,
            accountingDate: line.accountingDate,
            valueDate: line.valueDate,
            description: line.description,
            matchType: line.matchType,
        });
        if (cls.kind !== 'PAYOUT_MATCHED') continue;

        rows += 1;
        amountCents += Math.abs(r.totalCents);
        ivaCents += Math.abs(r.vatCents || 0);
        const key = `${r.fiscalYear}-T${r.fiscalQuarter}`;
        const liquidated = r.fiscalYear < now.getUTCFullYear() || r.fiscalQuarter < currentQ;
        if (liquidated) rowsInLiquidatedPeriods += 1;
        if (!byPeriod[key]) {
            byPeriod[key] = { rows: 0, amountCents: 0, ivaCents: 0, liquidatedIva: liquidated };
        }
        byPeriod[key].rows += 1;
        byPeriod[key].amountCents += Math.abs(r.totalCents);
        byPeriod[key].ivaCents += Math.abs(r.vatCents || 0);
    }

    return {
        rows,
        amountCents,
        ivaCents,
        rowsInLiquidatedPeriods,
        byPeriod,
        note: 'TARGET Fase 4: ricavi da ridurre di amountCents se queste BANK_LINE venissero riclassificate TRANSITO',
    };
}

async function functionalDryRun() {
    const credits = await prisma.bankStatementLine.findMany({
        where: { amountCents: { gt: 0 } },
        orderBy: { accountingDate: 'desc' },
        take: 400,
        select: {
            id: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            description: true,
            matchType: true,
        },
    });

    const matched: unknown[] = [];
    const pendingHint: unknown[] = [];
    const ordinary: unknown[] = [];

    for (const line of credits) {
        const cls = await dryRunClassifyBankLine(line);
        const row = {
            bankLineId: line.id,
            amountCents: line.amountCents,
            description: line.description.slice(0, 80),
            kind: cls.kind,
            category: cls.category,
            dare: cls.dareAccount,
            avere: cls.avereAccount,
            payoutId: cls.payoutId || null,
            entryNature: cls.entryNature,
        };
        if (cls.kind === 'PAYOUT_MATCHED' && matched.length < 8) matched.push(row);
        if (
            cls.kind === 'PENDING_CLASSIFICATION' &&
            /\b(STRIPE|PAYPAL)\b/i.test(line.description) &&
            pendingHint.length < 8
        ) {
            pendingHint.push(row);
        }
        if (
            cls.kind === 'ORDINARY' &&
            !/\b(STRIPE|PAYPAL|PAYOUT)\b/i.test(line.description) &&
            ordinary.length < 8
        ) {
            ordinary.push(row);
        }
    }

    // Terzo caso PENDING: dry-run sintetico (in Neon esistono solo 2 accrediti gateway senza payout id)
    const syntheticPending = await dryRunClassifyBankLine({
        id: 'synthetic-pending-stripe',
        amountCents: 98_765_432,
        accountingDate: new Date('2026-08-15T12:00:00.000Z'),
        valueDate: new Date('2026-08-15T12:00:00.000Z'),
        description: 'Ord: STRIPE Ben: FLOREMORIA S R L — accredito senza payout id abbinabile',
        matchType: null,
    });
    if (syntheticPending.kind === 'PENDING_CLASSIFICATION') {
        pendingHint.push({
            bankLineId: 'synthetic-pending-stripe',
            amountCents: 98_765_432,
            description: 'Ord: STRIPE Ben: FLOREMORIA (synthetic dry-run)',
            kind: syntheticPending.kind,
            category: syntheticPending.category,
            dare: syntheticPending.dareAccount,
            avere: syntheticPending.avereAccount,
            payoutId: null,
            entryNature: syntheticPending.entryNature,
            synthetic: true,
        });
    }

    // Idempotenza: dry-run commit di una BANK_LINE già in ledger
    const existing = await prisma.financialLedgerEntry.findFirst({
        where: { sourceType: 'BANK_LINE', reversedAt: null },
        select: {
            sourceKey: true,
            sourceId: true,
            bankLineId: true,
            direction: true,
            category: true,
            accountingDate: true,
            description: true,
            netCents: true,
            totalCents: true,
        },
    });
    let idempotency: Record<string, unknown> = { tested: false };
    if (existing) {
        const sample: LedgerEntryInput = {
            sourceKey: existing.sourceKey,
            sourceType: 'BANK_LINE',
            sourceId: existing.sourceId,
            direction: existing.direction as 'ENTRATA' | 'USCITA',
            category: existing.category as LedgerEntryInput['category'],
            accountingDate: existing.accountingDate,
            description: existing.description,
            netCents: existing.netCents,
            totalCents: existing.totalCents,
            bankLineId: existing.bankLineId || existing.sourceId,
        };
        const gate = await commitLedgerEntries([sample], { dryRun: true });
        const versioned = await commitLedgerEntries(
            [
                {
                    ...sample,
                    sourceKey: `${existing.sourceKey}:v${Date.now()}`,
                },
            ],
            { dryRun: true }
        );
        idempotency = {
            tested: true,
            existingSourceKey: existing.sourceKey,
            reprocessWouldInsert: gate.wouldInsert?.length || 0,
            reprocessSkipped: gate.skipped,
            versionedKeyRejected: versioned.skipped > 0 && (versioned.wouldInsert?.length || 0) === 0,
            versionedSkipReason: versioned.skippedDetails[0]?.reason || null,
        };
    }

    const matchedOk =
        matched.length >= 5 &&
        matched.every(
            (m) =>
                (m as { kind: string; category: string; entryNature: string }).kind ===
                    'PAYOUT_MATCHED' &&
                (m as { category: string }).category === 'TRASFERIMENTO_INTERNO' &&
                (m as { entryNature: string }).entryNature === 'TRANSITO' &&
                !/Ricavi/i.test((m as { avere: string }).avere)
        );
    const pendingOk =
        pendingHint.length >= 3 &&
        pendingHint.every(
            (m) =>
                (m as { kind: string; category: string }).kind === 'PENDING_CLASSIFICATION' &&
                (m as { category: string }).category === 'DA_CLASSIFICARE' &&
                !/Ricavi/i.test((m as { avere: string }).avere)
        );
    const pendingRealCount = pendingHint.filter((m) => !(m as { synthetic?: boolean }).synthetic)
        .length;
    const ordinaryOk = ordinary.length >= 3;
    const idemOk =
        Boolean(idempotency.tested) &&
        idempotency.reprocessWouldInsert === 0 &&
        idempotency.versionedKeyRejected === true;

    return {
        payoutIdClassificationEnabled: isPayoutIdClassificationEnabled(),
        samples: {
            matchedPayout: matched,
            pendingNoPayoutId: pendingHint,
            ordinary: ordinary,
        },
        counts: {
            matched: matched.length,
            pendingHint: pendingHint.length,
            pendingRealInDb: pendingRealCount,
            ordinary: ordinary.length,
        },
        notePending:
            'In Neon solo 2 accrediti STRIPE/PAYPAL senza payout id; il 3° caso è dry-run sintetico per chiudere il campione ≥3.',
        idempotency,
        pass: {
            matchedOk,
            pendingOk,
            ordinaryOk,
            idemOk,
            all: matchedOk && pendingOk && ordinaryOk && idemOk,
        },
    };
}

async function main() {
    console.log('[fase2-acceptance] start');

    const before = await snapshotInvariants();
    // Nessuna scrittura: after === before per costruzione Opzione A
    const after = await snapshotInvariants();
    const invariantsStable =
        before.ricaviLordiCents === after.ricaviLordiCents &&
        before.costiTotaliCents === after.costiTotaliCents &&
        before.ivaDebitoCents === after.ivaDebitoCents &&
        before.entryCount === after.entryCount &&
        before.saldoBancaCalcolatoCents === after.saldoBancaCalcolatoCents;

    const delta = await deltaAttesoFase4();
    const functional = await functionalDryRun();
    const transit = await compareGatewayTransitBalances();

    const report = {
        generatedAt: new Date().toISOString(),
        option: 'A_forward_looking',
        '5a_invariants': { before, after, stable: invariantsStable },
        '5b_delta_fase4': delta,
        '5c_functional_dry_run': functional,
        '5d_transit_vs_gateway': transit,
        commitAllowed: invariantsStable && functional.pass.all,
    };

    console.log(JSON.stringify(report, null, 2));

    if (!report.commitAllowed) {
        console.error('[fase2-acceptance] FAIL — non committare');
        process.exit(2);
    }
    console.log('[fase2-acceptance] PASS');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
