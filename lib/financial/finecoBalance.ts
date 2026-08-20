/**
 * Saldo Fineco manuale allineato dall'admin — SystemState Neon.
 */

import prisma from '@/lib/prisma';

export const FINECO_BALANCE_STATE_KEY = 'finance.fineco.manual_balance';

export type FinecoManualBalance = {
    balanceCents: number;
    alignedAt: string; // ISO
    note: string | null;
};

export async function getFinecoManualBalance(): Promise<FinecoManualBalance | null> {
    const row = await prisma.systemState.findUnique({
        where: { key: FINECO_BALANCE_STATE_KEY },
    });
    if (!row?.value) return null;
    try {
        const parsed = JSON.parse(row.value) as Partial<FinecoManualBalance>;
        if (typeof parsed.balanceCents !== 'number' || !Number.isFinite(parsed.balanceCents)) {
            return null;
        }
        return {
            balanceCents: Math.round(parsed.balanceCents),
            alignedAt: parsed.alignedAt || row.updatedAt.toISOString(),
            note: parsed.note ?? null,
        };
    } catch {
        return null;
    }
}

export async function setFinecoManualBalance(input: {
    balanceCents: number;
    note?: string | null;
}): Promise<FinecoManualBalance> {
    const payload: FinecoManualBalance = {
        balanceCents: Math.round(input.balanceCents),
        alignedAt: new Date().toISOString(),
        note: input.note?.trim() || null,
    };
    await prisma.systemState.upsert({
        where: { key: FINECO_BALANCE_STATE_KEY },
        create: { key: FINECO_BALANCE_STATE_KEY, value: JSON.stringify(payload) },
        update: { value: JSON.stringify(payload) },
    });
    return payload;
}
