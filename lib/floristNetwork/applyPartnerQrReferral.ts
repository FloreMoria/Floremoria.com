import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { readQrFeeCentsFromConfig } from '@/lib/floristNetwork/qrFeeConfig';
import { PARTNER_QR_SESSION_FLAG } from '@/lib/floristNetwork/partnerRefConstants';

function flagsRecord(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return { ...(raw as Record<string, unknown>) };
    }
    return {};
}

export function readPartnerQrSessionFromFlags(raw: unknown): string | null {
    const v = flagsRecord(raw)[PARTNER_QR_SESSION_FLAG];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function mergePartnerQrSessionFlag(
    raw: unknown,
    sessionToken: string | null
): Prisma.InputJsonValue {
    const next = flagsRecord(raw);
    if (sessionToken) next[PARTNER_QR_SESSION_FLAG] = sessionToken;
    else delete next[PARTNER_QR_SESSION_FLAG];
    return next as Prisma.InputJsonValue;
}

export type ApplyPartnerQrReferralResult =
    | { status: 'skipped'; reason: string }
    | { status: 'applied'; referralFloristId: string; referralFeeCents: number; scanEventId: string }
    | { status: 'conflict'; reason: string };

/**
 * Attribuzione fee QR alla CONFERMA pagamento (webhook).
 * Non tocca referralPartnerId (legacy B2B).
 * Unique su referralScanEventId: se già usata → ordine senza fee, log, no errore cliente.
 */
export async function applyPartnerQrReferralOnPaid(input: {
    orderId: string;
    sessionToken: string | null | undefined;
}): Promise<ApplyPartnerQrReferralResult> {
    const token = (input.sessionToken || '').trim();
    if (!token) {
        return { status: 'skipped', reason: 'no_session_token' };
    }

    const scan = await prisma.floristScanEvent.findUnique({
        where: { sessionToken: token },
        include: {
            florist: {
                select: {
                    id: true,
                    isActive: true,
                    deletedAt: true,
                    networkStatus: true,
                },
            },
            order: { select: { id: true } },
        },
    });

    if (!scan) {
        console.info('[florist-network] QR referral: scan non trovata', {
            orderId: input.orderId,
        });
        return { status: 'skipped', reason: 'scan_not_found' };
    }

    if (scan.order && scan.order.id !== input.orderId) {
        console.info('[florist-network] QR referral: scansione già collegata ad altro ordine → nessuna fee', {
            orderId: input.orderId,
            existingOrderId: scan.order.id,
            scanEventId: scan.id,
        });
        await clearPartnerQrSessionFlag(input.orderId);
        return { status: 'conflict', reason: 'scan_already_linked' };
    }

    // Idempotenza: stesso ordine già attribuito a questa scansione (webhook ripetuto).
    if (scan.order && scan.order.id === input.orderId) {
        const existing = await prisma.order.findUnique({
            where: { id: input.orderId },
            select: { referralFeeCents: true, referralFloristId: true },
        });
        await clearPartnerQrSessionFlag(input.orderId);
        return {
            status: 'applied',
            referralFloristId: existing?.referralFloristId || scan.floristId,
            referralFeeCents: existing?.referralFeeCents ?? 0,
            scanEventId: scan.id,
        };
    }

    const florist = scan.florist;
    if (
        !florist.isActive ||
        florist.deletedAt ||
        florist.networkStatus !== 'ACTIVE'
    ) {
        console.info('[florist-network] QR referral: Partner non ACTIVE → nessuna fee', {
            orderId: input.orderId,
            floristId: florist.id,
            networkStatus: florist.networkStatus,
        });
        await clearPartnerQrSessionFlag(input.orderId);
        return { status: 'skipped', reason: 'partner_not_active' };
    }

    const referralFeeCents = await readQrFeeCentsFromConfig();

    try {
        await prisma.order.update({
            where: { id: input.orderId },
            data: {
                referralFloristId: florist.id,
                referralScanEventId: scan.id,
                referralFeeCents,
                veraWorkflowFlags: await nextFlagsWithoutQrToken(input.orderId),
            },
        });
        console.info('[florist-network] QR referral applicata', {
            orderId: input.orderId,
            referralFloristId: florist.id,
            referralFeeCents,
            scanEventId: scan.id,
        });
        return {
            status: 'applied',
            referralFloristId: florist.id,
            referralFeeCents,
            scanEventId: scan.id,
        };
    } catch (err) {
        if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
        ) {
            console.info(
                '[florist-network] QR referral: vincolo unique (scansione già usata) → ordine senza fee',
                { orderId: input.orderId, scanEventId: scan.id }
            );
            await clearPartnerQrSessionFlag(input.orderId);
            return { status: 'conflict', reason: 'unique_violation' };
        }
        throw err;
    }
}

async function nextFlagsWithoutQrToken(orderId: string): Promise<Prisma.InputJsonValue> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { veraWorkflowFlags: true },
    });
    return mergePartnerQrSessionFlag(order?.veraWorkflowFlags, null);
}

async function clearPartnerQrSessionFlag(orderId: string): Promise<void> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { veraWorkflowFlags: true },
    });
    if (!order) return;
    await prisma.order.update({
        where: { id: orderId },
        data: { veraWorkflowFlags: mergePartnerQrSessionFlag(order.veraWorkflowFlags, null) },
    });
}
