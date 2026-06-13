import { verifyProofFotoToken } from '@/lib/auth/proofFotoAccess';
import { handleProofFotoAccess } from '@/lib/auth/proofFotoRoute';
import { getSiteBaseUrl } from '@/lib/futuria/config';
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

    return handleProofFotoAccess(request, orderId);
}
