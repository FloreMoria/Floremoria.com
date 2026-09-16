/**
 * C14 — Coerenza fee partner (maturato = fattura = trattenute Connect).
 * Stato di riposo verde raggiungibile; senza fattura del mese → non verificabile (non fallito).
 */
import prisma from '@/lib/prisma';
import type { PartnerFeeMonthCloseStatus } from '@prisma/client';

export const C14_DEFAULT_TOLERANCE_CENTS = 1;

export type C14RecomputeInput = {
    masterPartnerId: string;
    /** YYYY-MM */
    yearMonth: string;
    invoiceCents?: number | null;
    connectCents?: number | null;
    toleranceCents?: number;
};

export type C14Snapshot = {
    masterPartnerId: string;
    yearMonth: string;
    maturedCents: number;
    maturedTaxableCents: number;
    maturedVatCents: number;
    invoiceCents: number | null;
    connectCents: number | null;
    toleranceCents: number;
    status: PartnerFeeMonthCloseStatus;
    exceptionNote: string | null;
    verifiable: boolean;
    passed: boolean;
    deltas: {
        maturedVsInvoice: number | null;
        maturedVsConnect: number | null;
        invoiceVsConnect: number | null;
    };
};

function withinTolerance(a: number, b: number, tol: number): boolean {
    return Math.abs(a - b) <= tol;
}

function yearMonthBounds(yearMonth: string): { start: Date; end: Date } {
    const [ys, ms] = yearMonth.split('-');
    const y = Number(ys);
    const m = Number(ms);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
        throw new Error(`yearMonth non valido: ${yearMonth}`);
    }
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    return { start, end };
}

/** Somma fee maturate nel mese (ordini live non cancellati) — numero autorevole. */
export async function sumMaturedPartnerFeesForMonth(
    masterPartnerId: string,
    yearMonth: string
): Promise<{ maturedCents: number; maturedTaxableCents: number; maturedVatCents: number }> {
    const { start, end } = yearMonthBounds(yearMonth);
    const rows = await prisma.order.findMany({
        where: {
            masterPartnerId,
            isTest: false,
            deletedAt: null,
            status: { not: 'CANCELLED' },
            createdAt: { gte: start, lt: end },
            partnerCommissionCents: { not: null },
        },
        select: {
            partnerCommissionCents: true,
            partnerCommissionTaxableCents: true,
            partnerCommissionVatCents: true,
        },
    });

    let maturedCents = 0;
    let maturedTaxableCents = 0;
    let maturedVatCents = 0;
    for (const r of rows) {
        maturedCents += r.partnerCommissionCents ?? 0;
        maturedTaxableCents += r.partnerCommissionTaxableCents ?? 0;
        maturedVatCents += r.partnerCommissionVatCents ?? 0;
    }
    return { maturedCents, maturedTaxableCents, maturedVatCents };
}

export function evaluateC14Status(input: {
    maturedCents: number;
    invoiceCents: number | null;
    connectCents: number | null;
    toleranceCents: number;
}): {
    status: PartnerFeeMonthCloseStatus;
    exceptionNote: string | null;
    verifiable: boolean;
    passed: boolean;
    deltas: C14Snapshot['deltas'];
} {
    const { maturedCents, invoiceCents, connectCents, toleranceCents } = input;
    const deltas = {
        maturedVsInvoice:
            invoiceCents == null ? null : maturedCents - invoiceCents,
        maturedVsConnect:
            connectCents == null ? null : maturedCents - connectCents,
        invoiceVsConnect:
            invoiceCents == null || connectCents == null ? null : invoiceCents - connectCents,
    };

    if (invoiceCents == null) {
        return {
            status: 'NON_VERIFICABILE',
            exceptionNote: 'Fattura mensile non ancora registrata: C14 non verificabile (non fallito).',
            verifiable: false,
            passed: true,
            deltas,
        };
    }

    const invOk = withinTolerance(maturedCents, invoiceCents, toleranceCents);
    const connOk =
        connectCents == null
            ? true
            : withinTolerance(maturedCents, connectCents, toleranceCents) &&
              withinTolerance(invoiceCents, connectCents, toleranceCents);

    if (connectCents == null) {
        if (invOk) {
            return {
                status: 'RICEVUTA',
                exceptionNote: null,
                verifiable: false,
                passed: true,
                deltas,
            };
        }
        return {
            status: 'ECCEZIONE',
            exceptionNote: `Scostamento maturato↔fattura fuori tolleranza (±${toleranceCents}¢): Δ=${maturedCents - invoiceCents}¢.`,
            verifiable: true,
            passed: false,
            deltas,
        };
    }

    if (invOk && connOk) {
        return {
            status: 'QUADRATA',
            exceptionNote: null,
            verifiable: true,
            passed: true,
            deltas,
        };
    }

    return {
        status: 'ECCEZIONE',
        exceptionNote: `C14 fuori tolleranza (±${toleranceCents}¢): maturato=${maturedCents}, fattura=${invoiceCents}, connect=${connectCents}.`,
        verifiable: true,
        passed: false,
        deltas,
    };
}

/** Ricalcola e upserta PartnerFeeMonthClose per master+mese. */
export async function recomputePartnerFeeMonthClose(
    input: C14RecomputeInput
): Promise<C14Snapshot> {
    const toleranceCents = input.toleranceCents ?? C14_DEFAULT_TOLERANCE_CENTS;
    const matured = await sumMaturedPartnerFeesForMonth(input.masterPartnerId, input.yearMonth);

    const existing = await prisma.partnerFeeMonthClose.findUnique({
        where: {
            masterPartnerId_yearMonth: {
                masterPartnerId: input.masterPartnerId,
                yearMonth: input.yearMonth,
            },
        },
    });

    const invoiceCents =
        input.invoiceCents !== undefined ? input.invoiceCents : (existing?.invoiceCents ?? null);
    const connectCents =
        input.connectCents !== undefined ? input.connectCents : (existing?.connectCents ?? null);

    const evalResult = evaluateC14Status({
        maturedCents: matured.maturedCents,
        invoiceCents,
        connectCents,
        toleranceCents,
    });

    const status: PartnerFeeMonthCloseStatus =
        invoiceCents == null && connectCents == null && matured.maturedCents === 0
            ? 'ATTESA'
            : evalResult.status;

    const row = await prisma.partnerFeeMonthClose.upsert({
        where: {
            masterPartnerId_yearMonth: {
                masterPartnerId: input.masterPartnerId,
                yearMonth: input.yearMonth,
            },
        },
        create: {
            masterPartnerId: input.masterPartnerId,
            yearMonth: input.yearMonth,
            maturedCents: matured.maturedCents,
            maturedTaxableCents: matured.maturedTaxableCents,
            maturedVatCents: matured.maturedVatCents,
            invoiceCents,
            connectCents,
            toleranceCents,
            status,
            exceptionNote: evalResult.exceptionNote,
            invoiceReceivedAt: invoiceCents != null ? new Date() : null,
            closedAt: status === 'QUADRATA' ? new Date() : null,
        },
        update: {
            maturedCents: matured.maturedCents,
            maturedTaxableCents: matured.maturedTaxableCents,
            maturedVatCents: matured.maturedVatCents,
            invoiceCents,
            connectCents,
            toleranceCents,
            status,
            exceptionNote: evalResult.exceptionNote,
            invoiceReceivedAt:
                invoiceCents != null ? (existing?.invoiceReceivedAt ?? new Date()) : null,
            closedAt: status === 'QUADRATA' ? new Date() : null,
        },
    });

    return {
        masterPartnerId: row.masterPartnerId,
        yearMonth: row.yearMonth,
        maturedCents: row.maturedCents,
        maturedTaxableCents: row.maturedTaxableCents,
        maturedVatCents: row.maturedVatCents,
        invoiceCents: row.invoiceCents,
        connectCents: row.connectCents,
        toleranceCents: row.toleranceCents,
        status: row.status,
        exceptionNote: row.exceptionNote,
        verifiable: evalResult.verifiable,
        passed: evalResult.passed,
        deltas: evalResult.deltas,
    };
}

export async function controlC14(
    year: number,
    month: number,
    masterPartnerId?: string
): Promise<{
    id: 'C14';
    name: string;
    formula: string;
    measured: number;
    expected: number;
    delta: number;
    unit: 'cents';
    passed: boolean;
    verifiable: boolean;
    detail: string;
    snapshots: C14Snapshot[];
}> {
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
    const masters = await prisma.partner.findMany({
        where: {
            partnerType: 'AGGREGATOR',
            deletedAt: null,
            ...(masterPartnerId ? { id: masterPartnerId } : {}),
        },
        select: { id: true, shopName: true },
    });

    const snapshots: C14Snapshot[] = [];
    for (const m of masters) {
        snapshots.push(await recomputePartnerFeeMonthClose({ masterPartnerId: m.id, yearMonth }));
    }

    const verifiableOnes = snapshots.filter((s) => s.verifiable);
    const failed = verifiableOnes.filter((s) => !s.passed);
    const maxAbsDelta = Math.max(
        0,
        ...verifiableOnes.map((s) => Math.max(
            Math.abs(s.deltas.maturedVsInvoice ?? 0),
            Math.abs(s.deltas.maturedVsConnect ?? 0),
            Math.abs(s.deltas.invoiceVsConnect ?? 0)
        ))
    );

    const allUnverifiable = snapshots.length > 0 && snapshots.every((s) => !s.verifiable);

    return {
        id: 'C14',
        name: 'Coerenza fee partner (maturato = fattura = Connect)',
        formula: 'SUM(fee arrotondate per ordine) − fattura mensile − trattenute Connect = 0 (±tolleranza)',
        measured: maxAbsDelta,
        expected: 0,
        delta: maxAbsDelta,
        unit: 'cents',
        passed: failed.length === 0,
        verifiable: !allUnverifiable && verifiableOnes.length > 0,
        detail: allUnverifiable
            ? `C14 non verificabile: manca fattura mensile per ${snapshots.length} master (${yearMonth}).`
            : failed.length === 0
              ? `C14 OK su ${verifiableOnes.length} master verificabili (${yearMonth}).`
              : `C14 ECCEZIONE su ${failed.length}/${verifiableOnes.length} master (${yearMonth}).`,
        snapshots,
    };
}
