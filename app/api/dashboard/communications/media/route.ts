import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';
import { markChatSessionAsTest } from '@/lib/chatStore';
import { toWhatsAppSessionPhone } from '@/lib/whatsapp/sessionPhone';
import { fetchWhatsAppMediaFromMeta } from '@/lib/whatsapp/proxyWhatsAppMedia';
import { extractWhatsAppMediaId, resolveWhatsAppChatMediaUrl } from '@/lib/whatsapp/chatMediaUrls';
import { sendOperatorChatPhoto } from '@/lib/whatsapp/sendOperatorChatPhoto';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 16 * 1024 * 1024;

/**
 * Recupera i byte del media sorgente da inoltrare:
 * - URL proxy Meta (/api/dashboard/whatsapp/media/{id}) → download autenticato da Meta
 * - URL pubblico https (es. Blob) → fetch diretto
 */
async function resolveSourceMediaBytes(
    mediaUrl: string
): Promise<{ ok: true; buffer: Buffer; mimeType: string } | { ok: false; error: string }> {
    const mediaId = extractWhatsAppMediaId(mediaUrl);
    if (mediaId) {
        try {
            const { buffer, mimeType } = await fetchWhatsAppMediaFromMeta(mediaId);
            return { ok: true, buffer: Buffer.from(buffer), mimeType };
        } catch (err) {
            console.error('[communications/media] download Meta fallito:', err);
            return { ok: false, error: 'Impossibile scaricare il media originale da WhatsApp.' };
        }
    }

    const resolved = resolveWhatsAppChatMediaUrl(mediaUrl);
    if (resolved && /^https?:\/\//i.test(resolved)) {
        try {
            const res = await fetch(resolved);
            if (!res.ok) return { ok: false, error: `Media sorgente non raggiungibile (HTTP ${res.status}).` };
            const mimeType = res.headers.get('content-type') || 'application/octet-stream';
            const buffer = Buffer.from(await res.arrayBuffer());
            return { ok: true, buffer, mimeType };
        } catch (err) {
            console.error('[communications/media] fetch media pubblico fallito:', err);
            return { ok: false, error: 'Impossibile recuperare il media originale.' };
        }
    }

    return { ok: false, error: 'Media sorgente non valido o non inoltrabile.' };
}

async function respondWithPhotoResult(
    result: Awaited<ReturnType<typeof sendOperatorChatPhoto>>,
    sessionPhone: string
) {
    if (!result.ok) {
        return NextResponse.json(
            {
                success: false,
                error: result.error,
                requiresTemplate: result.requiresTemplate,
                errorCode: result.errorCode,
            },
            { status: result.requiresTemplate ? 409 : 502 }
        );
    }

    if (await getDashboardTestModeActive()) {
        await markChatSessionAsTest(sessionPhone);
    }

    return NextResponse.json({
        success: true,
        session: result.session,
        mediaUrl: result.mediaUrl,
        mode: result.mode,
    });
}

export async function POST(req: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const contentType = req.headers.get('content-type') || '';

    try {
        // 1) Upload da Finder (multipart): invia una foto nella chat attiva.
        if (contentType.includes('multipart/form-data')) {
            const form = await req.formData();
            const sessionPhone = toWhatsAppSessionPhone(String(form.get('phone') || ''));
            const caption = String(form.get('caption') || '').trim();
            const file = form.get('file');

            if (!sessionPhone) {
                return NextResponse.json({ success: false, error: 'Numero destinatario non valido.' }, { status: 400 });
            }
            if (!(file instanceof File) || file.size === 0) {
                return NextResponse.json({ success: false, error: 'File immagine mancante.' }, { status: 400 });
            }
            if (file.size > MAX_BYTES) {
                return NextResponse.json({ success: false, error: 'Immagine troppo grande (max 16 MB).' }, { status: 400 });
            }
            if (!file.type.startsWith('image/')) {
                return NextResponse.json({ success: false, error: 'Solo file immagine ammessi.' }, { status: 400 });
            }

            const buffer = Buffer.from(await file.arrayBuffer());
            const result = await sendOperatorChatPhoto({
                sessionPhone,
                buffer,
                caption,
                outboundMode: 'photo',
            });
            return respondWithPhotoResult(result, sessionPhone);
        }

        // 2) Inoltro foto da un'altra chat (JSON): es. foto del fiorista → chat utente.
        const body = await req.json();
        const targetPhone = toWhatsAppSessionPhone(String(body.targetPhone || ''));
        const sourceMediaUrl = String(body.mediaUrl || '').trim();
        const caption = String(body.caption || '').trim();

        if (!targetPhone) {
            return NextResponse.json({ success: false, error: 'Chat destinazione non valida.' }, { status: 400 });
        }
        if (!sourceMediaUrl) {
            return NextResponse.json({ success: false, error: 'Media da inoltrare mancante.' }, { status: 400 });
        }

        const source = await resolveSourceMediaBytes(sourceMediaUrl);
        if (!source.ok) {
            return NextResponse.json({ success: false, error: source.error }, { status: 400 });
        }
        if (!source.mimeType.toLowerCase().startsWith('image/')) {
            return NextResponse.json({ success: false, error: 'Solo le immagini possono essere inoltrate.' }, { status: 400 });
        }

        const result = await sendOperatorChatPhoto({
            sessionPhone: targetPhone,
            buffer: source.buffer,
            caption,
            outboundMode: 'forward',
        });
        return respondWithPhotoResult(result, targetPhone);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[communications/media] errore:', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
