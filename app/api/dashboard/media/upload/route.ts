import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { ensureUserForOrder } from '@/lib/auth/ensureOrderUser';
import { uploadProfileImage, type MediaEntityKind } from '@/lib/media/uploadProfileImage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

async function resolveUserIdForUpload(params: {
    entityId?: string;
    orderId?: string;
}): Promise<{ userId: string } | { error: string }> {
    const rawId = params.entityId?.trim();
    if (rawId && !rawId.startsWith('virtual_')) {
        const user = await prisma.user.findUnique({
            where: { id: rawId },
            select: { id: true, systemRole: true },
        });
        if (!user) return { error: 'Utente non trovato.' };
        return { userId: user.id };
    }

    const orderId = params.orderId?.trim() || (rawId?.startsWith('virtual_') ? rawId.slice('virtual_'.length) : '');
    if (!orderId) return { error: 'Ordine di riferimento mancante per questo utente virtuale.' };

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return { error: 'Ordine non trovato.' };

    const user = await ensureUserForOrder(order);
    if (!user) return { error: 'Impossibile risolvere l\'account utente dall\'ordine.' };

    return { userId: user.id };
}

/**
 * Upload avatar utente o foto defunto — solo ADMIN / SUPER_ADMIN (cookie staff).
 * Non accetta sessioni USER del Giardino della Memoria come autorizzazione.
 */
export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const form = await request.formData();
        const entity = String(form.get('entity') || '').trim() as MediaEntityKind;
        const entityId = String(form.get('entityId') || '').trim();
        const orderId = String(form.get('orderId') || '').trim();
        const file = form.get('file');

        if (entity !== 'user' && entity !== 'deceased') {
            return NextResponse.json({ ok: false, error: 'Entità non valida.' }, { status: 400 });
        }

        if (!(file instanceof File) || file.size === 0) {
            return NextResponse.json({ ok: false, error: 'File immagine mancante.' }, { status: 400 });
        }

        if (file.size > MAX_BYTES) {
            return NextResponse.json({ ok: false, error: 'Immagine troppo grande (max 12 MB).' }, { status: 400 });
        }

        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ ok: false, error: 'Solo file immagine ammessi.' }, { status: 400 });
        }

        if (entity === 'user') {
            const resolved = await resolveUserIdForUpload({ entityId, orderId });
            if ('error' in resolved) {
                return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 });
            }

            const url = await uploadProfileImage(file, 'user', resolved.userId);
            await prisma.user.update({
                where: { id: resolved.userId },
                data: { avatarUrl: url },
            });

            return NextResponse.json({ ok: true, url, userId: resolved.userId });
        }

        if (!entityId) {
            return NextResponse.json({ ok: false, error: 'ID defunto mancante.' }, { status: 400 });
        }

        const profile = await prisma.deceasedProfile.findUnique({
            where: { id: entityId },
            select: { id: true },
        });
        if (!profile) {
            return NextResponse.json({ ok: false, error: 'Profilo defunto non trovato.' }, { status: 404 });
        }

        const url = await uploadProfileImage(file, 'deceased', entityId);
        await prisma.deceasedProfile.update({
            where: { id: entityId },
            data: { photoUrl: url },
        });

        return NextResponse.json({ ok: true, url, deceasedProfileId: entityId });
    } catch (error) {
        console.error('[dashboard/media/upload]', error);
        const message = error instanceof Error ? error.message : 'Errore upload.';
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
