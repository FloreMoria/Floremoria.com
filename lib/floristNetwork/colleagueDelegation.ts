import type { OrderCancellationCause, OrderStatus } from '@prisma/client';
import prisma from '@/lib/prisma';

const COORDINATION_PERCENT_KEY = 'florist_network.coordination_percent';
const DEFAULT_COORDINATION_PERCENT = 10;

export async function readCoordinationPercentFromConfig(): Promise<number> {
    const row = await prisma.systemState.findUnique({
        where: { key: COORDINATION_PERCENT_KEY },
        select: { value: true },
    });
    const n = Number.parseFloat((row?.value || '').trim());
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
    console.warn(
        `[florist-network] ${COORDINATION_PERCENT_KEY} assente/invalido → fallback ${DEFAULT_COORDINATION_PERCENT}`
    );
    return DEFAULT_COORDINATION_PERCENT;
}

/** Fee coordinamento in centesimi (arrotondamento al centesimo). */
export function computeCoordinationFeeCents(
    floristCompensationCents: number | null | undefined,
    percent: number
): number {
    const base = Math.max(0, Math.round(floristCompensationCents ?? 0));
    if (base <= 0 || percent <= 0) return 0;
    return Math.round((base * percent) / 100);
}

/**
 * Esclusioni Art. coordinamento: test, errore fiorista, annullamento cliente.
 * (Altri CANCELLED senza causa cliente/fiorista: comunque niente 10% operativo.)
 */
export function isCoordinationFeeExcluded(order: {
    isTest?: boolean | null;
    status?: OrderStatus | string | null;
    cancellationCause?: OrderCancellationCause | string | null;
    deletedAt?: Date | string | null;
}): boolean {
    if (order.deletedAt) return true;
    if (order.isTest) return true;
    if (order.cancellationCause === 'FLORIST') return true;
    if (order.cancellationCause === 'CUSTOMER') return true;
    if (order.status === 'CANCELLED' && order.cancellationCause === 'CUSTOMER') return true;
    return false;
}

export type ColleagueDelegationState = {
    delegatedToColleague: boolean;
    coordinatorFloristId: string | null;
    coordinationFeeCents: number;
};

/**
 * Calcola lo stato coordinamento dalla spunta + compenso (senza scrivere).
 * ON → coordinator = Leader (partnerId), fee = % del compenso.
 * OFF → azzera. Esclusioni → sempre azzerato.
 */
export async function resolveColleagueDelegation(input: {
    delegatedToColleague: boolean;
    partnerId: string | null;
    floristCompensationCents: number | null | undefined;
    isTest?: boolean | null;
    status?: OrderStatus | string | null;
    cancellationCause?: OrderCancellationCause | string | null;
    deletedAt?: Date | string | null;
}): Promise<ColleagueDelegationState> {
    if (
        !input.delegatedToColleague ||
        !input.partnerId ||
        isCoordinationFeeExcluded(input)
    ) {
        return {
            delegatedToColleague: false,
            coordinatorFloristId: null,
            coordinationFeeCents: 0,
        };
    }
    const percent = await readCoordinationPercentFromConfig();
    return {
        delegatedToColleague: true,
        coordinatorFloristId: input.partnerId,
        coordinationFeeCents: computeCoordinationFeeCents(
            input.floristCompensationCents,
            percent
        ),
    };
}
