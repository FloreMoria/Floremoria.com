import { lookupProofFotoOrderByCode } from '@/lib/auth/proofFotoAccess';
import {
    handleProofFotoAccess,
    handleProofFotoExpiredAccess,
} from '@/lib/auth/proofFotoRoute';
import { getSiteBaseUrl } from '@/lib/site/config';
import { NextResponse } from 'next/server';

/**
 * Link corto WhatsApp: /f/{code} → bacheca foto (valido 24h; poi login passwordless).
 */
export async function GET(
    request: Request,
    context: { params: Promise<{ code: string }> }
) {
    const { code } = await context.params;
    const lookup = await lookupProofFotoOrderByCode(code);

    if (!lookup) {
        return NextResponse.redirect(`${getSiteBaseUrl()}/login?error=proof_foto_invalid`);
    }

    if (lookup.expired) {
        return handleProofFotoExpiredAccess(request, lookup.orderId, {
            buyerEmail: lookup.buyerEmail,
            customerPhone: lookup.customerPhone,
        });
    }

    return handleProofFotoAccess(request, lookup.orderId);
}
