import prisma from '@/lib/prisma';
import {
    isOrderProofFotoAccessAllowed,
    verifyProofFotoOrderSignature,
} from '@/lib/auth/proofFotoAccess';
import {
    handleProofFotoAccess,
    handleProofFotoExpiredAccess,
} from '@/lib/auth/proofFotoRoute';
import { getSiteBaseUrl } from '@/lib/site/config';
import { NextResponse } from 'next/server';

/**
 * Link firmato su orderNumber: /f/o/{orderNumber}/{sig}
 * Rispetta la finestra 24h (colonna proofFotoExpiresAt o data consegna).
 */
export async function GET(
    request: Request,
    context: { params: Promise<{ orderNumber: string; sig: string }> }
) {
    try {
        const { orderNumber, sig } = await context.params;
        const decodedNumber = decodeURIComponent(orderNumber).trim();
        const errorUrl = `${getSiteBaseUrl()}/login?error=proof_foto_invalid`;

        const order = await prisma.order.findFirst({
            where: { orderNumber: decodedNumber },
            select: {
                id: true,
                buyerEmail: true,
                customerPhone: true,
            },
        });

        if (!order || !verifyProofFotoOrderSignature(decodedNumber, sig)) {
            return NextResponse.redirect(errorUrl);
        }

        const allowed = await isOrderProofFotoAccessAllowed(order.id);
        if (!allowed) {
            return handleProofFotoExpiredAccess(request, order.id, {
                buyerEmail: order.buyerEmail,
                customerPhone: order.customerPhone,
            });
        }

        return handleProofFotoAccess(request, order.id);
    } catch (error) {
        console.error('[proof-foto] Errore route /f/o:', error);
        return NextResponse.redirect(`${getSiteBaseUrl()}/login?error=proof_foto_invalid`);
    }
}
