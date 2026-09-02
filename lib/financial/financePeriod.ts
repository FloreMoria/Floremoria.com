/**
 * Periodi fiscali: trimestri standard T1–T4 (ex Q1–Q4) e quadrimestri Gen–Apr / Mag–Ago / Set–Dic.
 */

import { trimestrePeriodLabel } from '@/lib/financial/trimestreLabel';

export type FiscalQuarter = 1 | 2 | 3 | 4;
export type FiscalQuadrimester = 1 | 2 | 3;
export type FinancePeriodMode = 'quarter' | 'quadrimester';

export type FinancePeriodBounds = {
    mode: FinancePeriodMode;
    year: number;
    index: number;
    start: Date;
    end: Date;
    label: string;
    periodKey: string;
};

export function resolveQuarterBounds(year: number, quarter: FiscalQuarter): FinancePeriodBounds {
    const startMonth = (quarter - 1) * 3;
    const start = new Date(year, startMonth, 1, 0, 0, 0, 0);
    const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
    return {
        mode: 'quarter',
        year,
        index: quarter,
        start,
        end,
        label: trimestrePeriodLabel(year, quarter),
        // Chiave interna stabile (retrocompatibile con archivi esistenti).
        periodKey: `${year}-Q${quarter}`,
    };
}

/** Q1 Gen–Apr, Q2 Mag–Ago, Q3 Set–Dic */
export function resolveQuadrimesterBounds(
    year: number,
    quadrimester: FiscalQuadrimester
): FinancePeriodBounds {
    const startMonth = (quadrimester - 1) * 4;
    const start = new Date(year, startMonth, 1, 0, 0, 0, 0);
    const end = new Date(year, startMonth + 4, 0, 23, 59, 59, 999);
    const monthLabels = ['Gen–Apr', 'Mag–Ago', 'Set–Dic'] as const;
    return {
        mode: 'quadrimester',
        year,
        index: quadrimester,
        start,
        end,
        label: `QM${quadrimester} ${year} (${monthLabels[quadrimester - 1]})`,
        periodKey: `${year}-QM${quadrimester}`,
    };
}

export function resolveFinancePeriod(params: {
    year: number;
    mode?: FinancePeriodMode | string | null;
    quarter?: number | null;
    quadrimester?: number | null;
}): FinancePeriodBounds {
    const year = params.year;
    const mode = (params.mode === 'quadrimester' ? 'quadrimester' : 'quarter') as FinancePeriodMode;
    if (mode === 'quadrimester') {
        const qm = ([1, 2, 3].includes(Number(params.quadrimester))
            ? Number(params.quadrimester)
            : Math.floor(new Date().getMonth() / 4) + 1) as FiscalQuadrimester;
        return resolveQuadrimesterBounds(year, qm);
    }
    const q = ([1, 2, 3, 4].includes(Number(params.quarter))
        ? Number(params.quarter)
        : Math.floor(new Date().getMonth() / 3) + 1) as FiscalQuarter;
    return resolveQuarterBounds(year, q);
}

export function periodKeyFromDate(d: Date, mode: FinancePeriodMode = 'quarter'): string {
    const y = d.getFullYear();
    if (mode === 'quadrimester') {
        const qm = (Math.floor(d.getMonth() / 4) + 1) as FiscalQuadrimester;
        return `${y}-QM${qm}`;
    }
    const q = (Math.floor(d.getMonth() / 3) + 1) as FiscalQuarter;
    return `${y}-Q${q}`;
}
