import { isOrderProofFotoAccessAllowed, verifyProofFotoToken } from '@/lib/auth/proofFotoAccess';
import {
    handleProofFotoAccess,
    handleProofFotoExpiredAccess,
} from '@/lib/auth/proofFotoRoute';
import { getSiteBaseUrl } from '@/lib/site/config';
import { NextResponse } from 'next/server';

/** Retrocompatibilità link lunghi già inviati prima del passaggio a /f/{code}. */
export async function GET(
    request: Request,
    context: { params: Promise<{ token: string }> }
) {
    const { token } = await context.params;
    const orderId = verifyProofFotoToken(token);

    if (!orderId) {
        return NextResponse.redirect(`${getSiteBaseUrl()}/login?error=proof_foto_invalid`);
    }

    const allowed = await isOrderProofFotoAccessAllowed(orderId);
    if (!allowed) {
        return handleProofFotoExpiredAccess(request, orderId);
    }

    return handleProofFotoAccess(request, orderId);
}
