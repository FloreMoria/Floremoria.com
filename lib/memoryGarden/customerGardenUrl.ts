/**
 * URL Giardino della Memoria per notifiche cliente post-consegna.
 * Priorità: profilo defunto → utente acquirente → link corto /f/{code} (24h).
 */
import prisma from '@/lib/prisma';
import { buildProofFotoAccessUrl, getProofFotoPublicBase } from '@/lib/auth/proofFotoAccess';

export type CustomerGardenUrlSource = 'deceased_profile' | 'user' | 'proof_foto_short';

export type CustomerGardenUrlResult = {
    url: string;
    source: CustomerGardenUrlSource;
};

function buildGiardinoPath(slug: string): string {
    return `${getProofFotoPublicBase()}/giardino/${encodeURIComponent(slug)}`;
}

/**
 * Risolve il link GdM più appropriato per l'ordine (defunto condiviso → stesso giardino).
 */
export async function buildCustomerGardenAccessUrl(
    orderId: string,
    orderNumber?: string | null
): Promise<CustomerGardenUrlResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
            id: true,
            orderNumber: true,
            deceasedProfileId: true,
            userId: true,
            deceasedProfile: { select: { id: true, uniqueCode: true } },
            user: { select: { id: true, uniqueCode: true } },
        },
    });

    if (!order) {
        const fallback = await buildProofFotoAccessUrl(orderId, orderNumber);
        return { url: fallback, source: 'proof_foto_short' };
    }

    if (order.deceasedProfileId) {
        const slug =
            order.deceasedProfile?.uniqueCode?.trim() || order.deceasedProfileId;
        return { url: buildGiardinoPath(slug), source: 'deceased_profile' };
    }

    if (order.userId) {
        const slug = order.user?.uniqueCode?.trim() || order.userId;
        return { url: buildGiardinoPath(slug), source: 'user' };
    }

    const fallback = await buildProofFotoAccessUrl(order.id, order.orderNumber || orderNumber);
    return { url: fallback, source: 'proof_foto_short' };
}
