import prisma from '@/lib/prisma';
import { verifyPartnerApiSecret } from '@/lib/partnerApiSecret';
import {
    isPartnerTestCredential,
    isPartnerApiLiveRuntime,
    TEST_CREDENTIAL_ON_LIVE_ERROR,
} from '@/lib/partnerTestCredential';

export type PartnerV1AuthContext = {
    partnerId: string;
    credentialId: string;
    /** Public id credenziale (`fmp_live_…` / `fmp_test_…`). */
    publicId: string;
    isTestCredential: boolean;
};

export class PartnerTestCredentialOnLiveError extends Error {
    readonly code = typeof TEST_CREDENTIAL_ON_LIVE_ERROR.code;
    constructor() {
        super(TEST_CREDENTIAL_ON_LIVE_ERROR.error);
        this.name = 'PartnerTestCredentialOnLiveError';
    }
}

/**
 * Partner API v1: autenticazione allineata alle credenziali dashboard (`PartnerApiCredential`).
 * Chiave test su runtime live → errore esplicito (mai 200).
 */
export async function authenticatePartnerV1(request: Request): Promise<PartnerV1AuthContext | null> {
    const rawHeader = request.headers.get('x-partner-key')?.trim() ?? '';
    const authHeader = request.headers.get('authorization')?.trim() ?? '';
    const bearer =
        authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

    let publicId = rawHeader;
    let secretPlain = bearer;

    if (rawHeader.includes(':')) {
        const idx = rawHeader.indexOf(':');
        publicId = rawHeader.slice(0, idx).trim();
        secretPlain = rawHeader.slice(idx + 1).trim() || bearer;
    }

    if (!publicId || !secretPlain) {
        return null;
    }

    const cred = await prisma.partnerApiCredential.findFirst({
        where: { publicId, isActive: true },
    });
    if (!cred || !verifyPartnerApiSecret(secretPlain, cred.secretHash)) {
        return null;
    }

    const isTestCredential = isPartnerTestCredential(cred.publicId);
    if (isTestCredential && isPartnerApiLiveRuntime(request)) {
        throw new PartnerTestCredentialOnLiveError();
    }

    return {
        partnerId: cred.partnerId,
        credentialId: cred.id,
        publicId: cred.publicId,
        isTestCredential,
    };
}

export async function touchPartnerCredentialLastUsed(credentialId: string): Promise<void> {
    await prisma.partnerApiCredential.update({
        where: { id: credentialId },
        data: { lastUsedAt: new Date() },
    });
}
