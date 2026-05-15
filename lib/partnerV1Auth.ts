import prisma from '@/lib/prisma';
import { verifyPartnerApiSecret } from '@/lib/partnerApiSecret';

export type PartnerV1AuthContext = {
    partnerId: string;
    credentialId: string;
};

/**
 * Partner API v1: autenticazione allineata alle credenziali dashboard (`PartnerApiCredential`).
 * `X-Partner-Key` può contenere solo il publicId (`fmp_…`) oppure `publicId:secretPlain` in un unico header;
 * in alternativa publicId in header e segreto in `Authorization: Bearer …`.
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

    return { partnerId: cred.partnerId, credentialId: cred.id };
}

export async function touchPartnerCredentialLastUsed(credentialId: string): Promise<void> {
    await prisma.partnerApiCredential.update({
        where: { id: credentialId },
        data: { lastUsedAt: new Date() },
    });
}
