/**
 * Snapshot immutabile Registro Corrispettivi commercialista.
 * Perché: un totale fiscale che si ricalcola da solo non è difendibile in sede di controllo.
 * Download = lettura snapshot; ricalcolo live solo alla prima generazione o rettifica esplicita.
 */
import { createHash } from 'crypto';
import prisma from '@/lib/prisma';
import type { CommercialistaPeriod } from '@/lib/financial/commercialistaCorrispettiviXlsx';

export type CorrispettiviSnapshotRow = {
    date: string;
    orderRef: string;
    channel: string;
    imponibileCents: number;
    vatRate: number;
    ivaCents: number;
    lordoCents: number;
    transactionId?: string | null;
};

export type CorrispettiviSnapshotPayload = {
    year: number;
    quarter: number;
    rows: CorrispettiviSnapshotRow[];
    lordoCents: number;
    imponibileCents: number;
    ivaCents: number;
    rowCount: number;
};

export function periodToQuarterKey(period: CommercialistaPeriod): {
    year: number;
    quarter: number;
} {
    if (period.kind === 'year') return { year: period.year, quarter: 0 };
    return { year: period.year, quarter: period.quarter };
}

/** Hash stabile sul contenuto F2 (non sull’orario di generazione). */
export function hashCorrispettiviRows(rows: CorrispettiviSnapshotRow[]): string {
    const canonical = [...rows]
        .map((r) => ({
            date: r.date,
            orderRef: r.orderRef,
            channel: r.channel,
            imponibileCents: r.imponibileCents,
            vatRate: r.vatRate,
            ivaCents: r.ivaCents,
            lordoCents: r.lordoCents,
            transactionId: r.transactionId || null,
        }))
        .sort((a, b) => {
            const d = a.date.localeCompare(b.date);
            if (d !== 0) return d;
            return a.orderRef.localeCompare(b.orderRef) || a.lordoCents - b.lordoCents;
        });
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export async function getActiveCorrispettiviSnapshot(year: number, quarter: number) {
    return prisma.corrispettiviRegisterSnapshot.findFirst({
        where: { year, quarter, isActive: true },
        orderBy: { version: 'desc' },
    });
}

export async function listCorrispettiviSnapshots(year: number, quarter: number) {
    return prisma.corrispettiviRegisterSnapshot.findMany({
        where: { year, quarter },
        orderBy: { version: 'asc' },
        select: {
            id: true,
            version: true,
            isActive: true,
            frozenAt: true,
            contentHash: true,
            rowCount: true,
            lordoCents: true,
            imponibileCents: true,
            ivaCents: true,
            filename: true,
            rettificaMotivo: true,
            rettificaAt: true,
            createdAt: true,
        },
    });
}

/**
 * Persiste un nuovo snapshot. Se alreadyExists e non è rettifica → no-op (restituisce attivo).
 * Rettifica: disattiva le versioni precedenti e crea versione+1 con motivo obbligatorio.
 */
export async function freezeCorrispettiviSnapshot(input: {
    year: number;
    quarter: number;
    rows: CorrispettiviSnapshotRow[];
    lordoCents: number;
    imponibileCents: number;
    ivaCents: number;
    xlsxBytes: Buffer;
    filename: string;
    rettificaMotivo?: string | null;
}): Promise<{
    snapshot: Awaited<ReturnType<typeof getActiveCorrispettiviSnapshot>>;
    created: boolean;
}> {
    const contentHash = hashCorrispettiviRows(input.rows);
    const active = await getActiveCorrispettiviSnapshot(input.year, input.quarter);

    if (active && !input.rettificaMotivo) {
        // Già congelato: non sovrascrivere
        return { snapshot: active, created: false };
    }

    if (input.rettificaMotivo && active && active.contentHash === contentHash) {
        // Rettifica senza cambio numeri: rifiuta
        throw new Error(
            'Rettifica rifiutata: il contenuto coincide con lo snapshot attivo (nessuna differenza).'
        );
    }

    const maxVer = await prisma.corrispettiviRegisterSnapshot.aggregate({
        where: { year: input.year, quarter: input.quarter },
        _max: { version: true },
    });
    const nextVersion = (maxVer._max.version || 0) + 1;
    const now = new Date();

    const snapshot = await prisma.$transaction(async (tx) => {
        if (active) {
            await tx.corrispettiviRegisterSnapshot.updateMany({
                where: { year: input.year, quarter: input.quarter, isActive: true },
                data: { isActive: false },
            });
        }
        return tx.corrispettiviRegisterSnapshot.create({
            data: {
                year: input.year,
                quarter: input.quarter,
                version: nextVersion,
                isActive: true,
                frozenAt: now,
                contentHash,
                sourceEngine: 'gateway_corrispettivi',
                rowCount: input.rows.length,
                lordoCents: input.lordoCents,
                imponibileCents: input.imponibileCents,
                ivaCents: input.ivaCents,
                rowsJson: input.rows,
                xlsxBytes: new Uint8Array(input.xlsxBytes),
                filename: input.filename,
                rettificaMotivo: input.rettificaMotivo?.trim() || null,
                rettificaAt: input.rettificaMotivo ? now : null,
            },
        });
    });

    return { snapshot, created: true };
}
