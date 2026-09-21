/**
 * Erario c/IVA — scritture patrimoniali (non economiche).
 * Debito = registro corrispettivi; credito = fatture passive SDI.
 * Il CE non deve muoversi: queste righe sono escluse dal PnL.
 */
import prisma from '@/lib/prisma';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import {
    buildTaxQuarterlyReport,
    resolveQuarterBounds,
    type TaxQuarter,
} from '@/lib/financial/taxQuarterly';
import { fiscalParts } from '@/lib/financial/historicalLedgerTypes';

export const ERARIO_IVA_CATEGORY = 'ERARIO_C_IVA' as const;

export type ErarioIvaPeriod = {
    year: number;
    quarter: TaxQuarter;
    debitoCorrispettiviCents: number;
    creditoFatturePassiveCents: number;
    saldoCents: number;
};

function sourceKeyDebito(year: number, quarter: TaxQuarter) {
    return `ERARIO_IVA_DEBITO:${year}:T${quarter}`;
}
function sourceKeyCredito(year: number, quarter: TaxQuarter) {
    return `ERARIO_IVA_CREDITO:${year}:T${quarter}`;
}

/** Calcola debito/credito Erario per trimestre (fonti dichiarazione). */
export async function computeErarioIvaPeriod(
    year: number,
    quarter: TaxQuarter
): Promise<ErarioIvaPeriod> {
    const bounds = resolveQuarterBounds(year, quarter);
    const built = await buildGatewayCorrispettivi({
        start: bounds.start,
        end: bounds.end,
    });
    const debitoCorrispettiviCents = built.totals.ivaDebitoCents;
    const report = await buildTaxQuarterlyReport(year, quarter);
    const creditoFatturePassiveCents = report.ivaSummary.floristIvaCreditoCents;
    return {
        year,
        quarter,
        debitoCorrispettiviCents,
        creditoFatturePassiveCents,
        saldoCents: debitoCorrispettiviCents - creditoFatturePassiveCents,
    };
}

/**
 * Upsert scritture patrimoniali Erario per il trimestre.
 * Contropartita: conto Erario c/IVA (passivo per debito, attivo per credito).
 * Nessun impatto sul risultato economico.
 */
export async function syncErarioIvaWritings(
    year: number,
    quarter: TaxQuarter
): Promise<ErarioIvaPeriod & { wrote: boolean }> {
    const period = await computeErarioIvaPeriod(year, quarter);
    const bounds = resolveQuarterBounds(year, quarter);
    const accountingDate = new Date(Date.UTC(year, quarter * 3, 0, 12, 0, 0)); // fine trimestre
    const parts = fiscalParts(accountingDate);

    async function upsert(
        key: string,
        direction: 'ENTRATA' | 'USCITA',
        amountAbs: number,
        description: string
    ) {
        const existing = await prisma.financialLedgerEntry.findFirst({
            where: { sourceKey: key, reversedAt: null },
            select: { id: true },
        });
        const signed = direction === 'ENTRATA' ? amountAbs : -amountAbs;
        const data = {
            sourceType: 'SYSTEM_ERARIO_IVA',
            sourceId: key,
            sourceKey: key,
            category: ERARIO_IVA_CATEGORY,
            direction,
            totalCents: signed,
            netCents: signed,
            vatCents: 0,
            accountingDate,
            description,
            documentRef: `Erario c/IVA T${quarter} ${year}`,
            fiscalYear: parts.fiscalYear,
            fiscalQuarter: parts.fiscalQuarter,
            periodKey: parts.periodKey,
            entryNature: 'FINANZIARIA' as const,
            settlementStatus: 'NOT_APPLICABLE' as const,
            metadataJson: {
                erarioIva: true,
                year,
                quarter,
                kind: key.includes('DEBITO') ? 'DEBITO' : 'CREDITO',
                syncedAt: new Date().toISOString(),
            },
        };
        if (amountAbs === 0) {
            if (existing) {
                await prisma.financialLedgerEntry.update({
                    where: { id: existing.id },
                    data: {
                        reversedAt: new Date(),
                        metadataJson: {
                            reversedReason: 'Erario IVA azzerato',
                            reversedAt: new Date().toISOString(),
                        },
                    },
                });
            }
            return;
        }
        if (existing) {
            await prisma.financialLedgerEntry.update({
                where: { id: existing.id },
                data,
            });
        } else {
            await prisma.financialLedgerEntry.create({ data });
        }
    }

    // Debito verso Erario = passività (USCITA sul ledger = aumento debito in SP)
    await upsert(
        sourceKeyDebito(year, quarter),
        'USCITA',
        period.debitoCorrispettiviCents,
        `Erario c/IVA — debito da registro corrispettivi T${quarter} ${year}`
    );
    // Credito verso Erario = attività (ENTRATA)
    await upsert(
        sourceKeyCredito(year, quarter),
        'ENTRATA',
        period.creditoFatturePassiveCents,
        `Erario c/IVA — credito da fatture passive T${quarter} ${year}`
    );

    return { ...period, wrote: true };
}

/** Somma scritture Erario già in ledger (per C15 / SP). */
export async function readErarioIvaFromLedger(
    year: number,
    quarter?: TaxQuarter | null
): Promise<{ debitoCents: number; creditoCents: number }> {
    const where: Record<string, unknown> = {
        reversedAt: null,
        fiscalYear: year,
        category: ERARIO_IVA_CATEGORY,
        sourceType: 'SYSTEM_ERARIO_IVA',
    };
    if (quarter) where.fiscalQuarter = quarter;
    const rows = await prisma.financialLedgerEntry.findMany({
        where,
        select: { sourceKey: true, totalCents: true, direction: true },
    });
    let debitoCents = 0;
    let creditoCents = 0;
    for (const r of rows) {
        const abs = Math.abs(r.totalCents);
        if ((r.sourceKey || '').includes('DEBITO')) debitoCents += abs;
        else if ((r.sourceKey || '').includes('CREDITO')) creditoCents += abs;
    }
    return { debitoCents, creditoCents };
}

export async function syncErarioIvaYear(year: number): Promise<ErarioIvaPeriod[]> {
    const out: ErarioIvaPeriod[] = [];
    for (const q of [1, 2, 3, 4] as TaxQuarter[]) {
        const bounds = resolveQuarterBounds(year, q);
        if (bounds.start > new Date()) continue;
        out.push(await syncErarioIvaWritings(year, q));
    }
    return out;
}
