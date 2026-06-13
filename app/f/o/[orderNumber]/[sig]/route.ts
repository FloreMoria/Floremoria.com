import prisma from '@/lib/prisma';
import { verifyProofFotoOrderSignature } from '@/lib/auth/proofFotoAccess';
import { handleProofFotoAccess } from '@/lib/auth/proofFotoRoute';
import { getSiteBaseUrl } from '@/lib/futuria/config';
import { NextResponse } from 'next/server';

/**
 * Link firmato su orderNumber: /f/o/{orderNumber}/{sig}
 * Non richiede colonna DB — funziona subito dopo deploy.
 */
export async function GET(
    request: Request,
    context: { params: Promise<{ orderNumber: string; sig: string }> }
) {
    const { orderNumber, sig } = await context.params;
    const decodedNumber = decodeURIComponent(orderNumber).trim();
    const errorUrl = `${getSiteBaseUrl()}/login?error=proof_foto_invalid`;

    const order = await prisma.order.findFirst({
        where: { orderNumber: decodedNumber },
    });

    if (!order || !verifyProofFotoOrderSignature(decodedNumber, sig)) {
        return NextResponse.redirect(errorUrl);
    }

    return handleProofFotoAccess(request, order.id);
}
