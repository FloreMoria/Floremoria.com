/**
 * Autorizza download HD delle foto di posa (Utente proprietario ordine o Admin).
 * Perché: fetch diretto Blob dal browser può fallire (CORS / private); serve proxy server-side.
 */
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { findUserByEmail } from '@/lib/auth/identity';
import { isDashboardAdminRole } from '@/lib/superAdmin';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';

function normalizeUrl(url: string): string {
    return (url || '').trim().split('?')[0] || '';
}

export async function authorizeProofPhotoDownload(params: {
    orderId: string;
    photoUrl: string;
}): Promise<
    | { ok: true; deceasedName: string; allowedUrl: string }
    | { ok: false; status: number; error: string }
> {
    const orderId = params.orderId.trim();
    const photoUrl = normalizeUrl(params.photoUrl);
    if (!orderId || !photoUrl) {
        return { ok: false, status: 400, error: 'Parametri mancanti.' };
    }

    const cookieStore = await cookies();
    const role = cookieStore.get('fm_user_role')?.value;
    const email = cookieStore.get('fm_user_email')?.value?.trim().toLowerCase();
    if (!role || !email) {
        return { ok: false, status: 401, error: 'Accesso richiesto.' };
    }

    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
            id: true,
            userId: true,
            buyerEmail: true,
            deceasedName: true,
            photos: true,
            deliveryProof: {
                select: {
                    photoBeforeUrl: true,
                    photoAfterUrl: true,
                    photosBeforeUrls: true,
                    photosAfterUrls: true,
                },
            },
            deceasedProfile: { select: { fullName: true } },
        },
    });

    if (!order) {
        return { ok: false, status: 404, error: 'Ordine non trovato.' };
    }

    const isAdmin = isDashboardAdminRole(role);
    if (!isAdmin) {
        const user = await findUserByEmail(email);
        if (!user) {
            return { ok: false, status: 403, error: 'Non autorizzato.' };
        }
        const ownsOrder =
            order.userId === user.id ||
            (order.buyerEmail || '').trim().toLowerCase() === user.email.trim().toLowerCase();
        if (!ownsOrder) {
            return { ok: false, status: 403, error: 'Non autorizzato per questo ordine.' };
        }
    }

    const proof = getOrderProofPhotos(order);
    const allowed = [...proof.before, ...proof.after].map(normalizeUrl);
    if (!allowed.includes(photoUrl)) {
        return { ok: false, status: 403, error: 'Foto non collegata a questo ordine.' };
    }

    // Preferisci URL originale completo se presente (con query firmate).
    const original =
        [...proof.before, ...proof.after].find((u) => normalizeUrl(u) === photoUrl) || photoUrl;

    return {
        ok: true,
        deceasedName: order.deceasedProfile?.fullName || order.deceasedName || 'posa',
        allowedUrl: original,
    };
}
