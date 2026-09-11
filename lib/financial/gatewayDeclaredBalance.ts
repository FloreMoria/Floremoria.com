/**
 * Saldi wallet gateway dichiarati dall’admin (come Fineco).
 * Fonte di verità esterna per C13 — mai stimati dal ledger.
 */

import prisma from '@/lib/prisma';

export const STRIPE_DECLARED_BALANCE_KEY = 'finance.stripe.declared_balance';
export const PAYPAL_DECLARED_BALANCE_KEY = 'finance.paypal.declared_balance';

export type GatewayDeclaredBalance = {
    balanceCents: number;
    /** Data di riferimento del saldo dichiarato (ISO day o datetime). */
    asOf: string;
    alignedAt: string;
    note: string | null;
};

async function getDeclared(key: string): Promise<GatewayDeclaredBalance | null> {
    const row = await prisma.systemState.findUnique({ where: { key } });
    if (!row?.value) return null;
    try {
        const parsed = JSON.parse(row.value) as Partial<GatewayDeclaredBalance>;
        if (typeof parsed.balanceCents !== 'number' || !Number.isFinite(parsed.balanceCents)) {
            return null;
        }
        return {
            balanceCents: Math.round(parsed.balanceCents),
            asOf: parsed.asOf || row.updatedAt.toISOString().slice(0, 10),
            alignedAt: parsed.alignedAt || row.updatedAt.toISOString(),
            note: parsed.note ?? null,
        };
    } catch {
        return null;
    }
}

async function setDeclared(
    key: string,
    input: { balanceCents: number; asOf?: string; note?: string | null }
): Promise<GatewayDeclaredBalance> {
    const payload: GatewayDeclaredBalance = {
        balanceCents: Math.round(input.balanceCents),
        asOf: input.asOf?.trim() || new Date().toISOString().slice(0, 10),
        alignedAt: new Date().toISOString(),
        note: input.note?.trim() || null,
    };
    await prisma.systemState.upsert({
        where: { key },
        create: { key, value: JSON.stringify(payload) },
        update: { value: JSON.stringify(payload) },
    });
    return payload;
}

export function getStripeDeclaredBalance(): Promise<GatewayDeclaredBalance | null> {
    return getDeclared(STRIPE_DECLARED_BALANCE_KEY);
}

export function getPaypalDeclaredBalance(): Promise<GatewayDeclaredBalance | null> {
    return getDeclared(PAYPAL_DECLARED_BALANCE_KEY);
}

export function setStripeDeclaredBalance(input: {
    balanceCents: number;
    asOf?: string;
    note?: string | null;
}): Promise<GatewayDeclaredBalance> {
    return setDeclared(STRIPE_DECLARED_BALANCE_KEY, input);
}

export function setPaypalDeclaredBalance(input: {
    balanceCents: number;
    asOf?: string;
    note?: string | null;
}): Promise<GatewayDeclaredBalance> {
    return setDeclared(PAYPAL_DECLARED_BALANCE_KEY, input);
}
