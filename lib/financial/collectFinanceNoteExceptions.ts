/**
 * Eccezioni dossier da annotazioni operative su Order.financeNotes.
 * Prefisso DOSSIER_ECCEZIONE: — riga dichiarata, non nascosta (§9 METODO).
 */
import prisma from '@/lib/prisma';
import type { DossierExceptionRow } from '@/lib/financial/dossierAcquistiBuild';

const TAG = 'DOSSIER_ECCEZIONE:';

export async function collectFinanceNoteExceptions(params: {
    start: Date;
    end: Date;
}): Promise<DossierExceptionRow[]> {
    const orders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            OR: [
                { createdAt: { gte: params.start, lte: params.end } },
                { updatedAt: { gte: params.start, lte: params.end } },
            ],
            financeNotes: { contains: TAG },
        },
        select: {
            orderNumber: true,
            totalPriceCents: true,
            financeNotes: true,
            createdAt: true,
        },
        take: 500,
    });

    const out: DossierExceptionRow[] = [];
    for (const o of orders) {
        const notes = o.financeNotes || '';
        const idx = notes.indexOf(TAG);
        if (idx < 0) continue;
        const body = notes.slice(idx + TAG.length).trim().slice(0, 400);
        out.push({
            cosa: `Annotazione ordine ${o.orderNumber || 'n.c.'}`,
            dove: `Order · ${o.createdAt.toISOString().slice(0, 10)}`,
            importoCents: o.totalPriceCents,
            perche: body || 'Eccezione dichiarata in financeNotes',
        });
    }
    return out;
}
