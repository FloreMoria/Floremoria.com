import { resolveProofFotoOrderId } from '@/lib/auth/proofFotoAccess';
import { handleProofFotoAccess } from '@/lib/auth/proofFotoRoute';
import { getSiteBaseUrl } from '@/lib/futuria/config';
import { NextResponse } from 'next/server';

/**
 * Link corto WhatsApp: /f/{code} → bacheca foto senza login manuale.
 */
export async function GET(
    request: Request,
    context: { params: Promise<{ code: string }> }
) {
    const { code } = await context.params;
    const orderId = await resolveProofFotoOrderId(code);

    if (!orderId) {
        return NextResponse.redirect(`${getSiteBaseUrl()}/login?error=proof_foto_invalid`);
    }

    return handleProofFotoAccess(request, orderId);
}
