/**
 * Snapshot persistito dei controlli C1–C10 (SystemState).
 * Il badge Contabilità legge l’ultima esecuzione, non ricalcola a ogni page load.
 */
import prisma from '@/lib/prisma';
import type { TaxQuarter } from '@/lib/financial/taxQuarterly';
import type { DossierControlResult } from '@/lib/financial/dossierFiscalControls';

export const DOSSIER_CONTROLS_STATE_PREFIX = 'finance.dossier.controls';

export type DossierControlsSnapshot = {
    year: number;
    quarter: TaxQuarter;
    periodLabel: string;
    ranAt: string;
    passed: number;
    total: number;
    /** Controlli falliti (verificabili e non passati). */
    failedCount: number;
    /** Controlli non verificabili (es. C3 senza saldi). */
    notVerifiableCount: number;
    controls: DossierControlResult[];
};

function stateKey(year: number, quarter: TaxQuarter): string {
    return `${DOSSIER_CONTROLS_STATE_PREFIX}.${year}.T${quarter}`;
}

export async function getDossierControlsSnapshot(
    year: number,
    quarter: TaxQuarter
): Promise<DossierControlsSnapshot | null> {
    const row = await prisma.systemState.findUnique({
        where: { key: stateKey(year, quarter) },
    });
    if (!row?.value) return null;
    try {
        const parsed = JSON.parse(row.value) as DossierControlsSnapshot;
        if (!parsed?.ranAt || !Array.isArray(parsed.controls)) return null;
        return parsed;
    } catch {
        return null;
    }
}

export async function saveDossierControlsSnapshot(
    snapshot: DossierControlsSnapshot
): Promise<DossierControlsSnapshot> {
    const key = stateKey(snapshot.year, snapshot.quarter);
    const value = JSON.stringify(snapshot);
    await prisma.systemState.upsert({
        where: { key },
        create: { key, value },
        update: { value },
    });
    return snapshot;
}

/** Ultimo movimento contabile rilevante per capire se lo snapshot è obsoleto. */
export async function getLatestAccountingActivityAt(
    year: number,
    quarter: TaxQuarter
): Promise<Date | null> {
    const startMonth = (quarter - 1) * 3 + 1;
    const start = new Date(Date.UTC(year, startMonth - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, startMonth + 2, 0, 23, 59, 59, 999));

    const [exp, bank, stripe] = await Promise.all([
        prisma.manualFinanceExpense.findFirst({
            where: { expenseDate: { gte: start, lte: end } },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true },
        }),
        prisma.bankStatementLine.findFirst({
            where: {
                OR: [
                    { accountingDate: { gte: start, lte: end } },
                    { valueDate: { gte: start, lte: end } },
                ],
            },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true },
        }),
        prisma.stripeFinanceMovement.findFirst({
            where: { createdAtStripe: { gte: start, lte: end } },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true },
        }),
    ]);

    const times = [exp?.updatedAt, bank?.updatedAt, stripe?.updatedAt].filter(
        (d): d is Date => d instanceof Date
    );
    if (times.length === 0) return null;
    return new Date(Math.max(...times.map((d) => d.getTime())));
}

export function isSnapshotStale(
    snapshot: DossierControlsSnapshot,
    latestActivityAt: Date | null
): boolean {
    if (!latestActivityAt) return false;
    const ran = new Date(snapshot.ranAt).getTime();
    if (!Number.isFinite(ran)) return true;
    return latestActivityAt.getTime() > ran;
}

export function summarizeControls(controls: DossierControlResult[]): {
    passed: number;
    total: number;
    failedCount: number;
    notVerifiableCount: number;
} {
    const verifiable = controls.filter((c) => c.verifiable !== false);
    const notVerifiableCount = controls.length - verifiable.length;
    const failedCount = verifiable.filter((c) => !c.passed).length;
    const passed = verifiable.filter((c) => c.passed).length;
    return {
        passed,
        total: controls.length,
        failedCount,
        notVerifiableCount,
    };
}
