import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isValidEmailForBlacklist } from '@/lib/postman/emailBlacklist';
import {
    buildMemorialShareEmailHtml,
    buildMemorialShareEmailSubject,
    buildMemorialShareEmailText,
} from '@/lib/memoryGarden/shareEmailTemplate';
import { sendFloremTransactionalMail } from '@/lib/serverMail';
import { getSiteBaseUrl } from '@/lib/site/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Rate limit semplice in-memory (per istanza): max 8 invii / ora / IP. */
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 8;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest): string {
    const fwd = request.headers.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
    return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function allowRate(ip: string): boolean {
    const now = Date.now();
    const bucket = rateBuckets.get(ip);
    if (!bucket || now >= bucket.resetAt) {
        rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return true;
    }
    if (bucket.count >= RATE_MAX) return false;
    bucket.count += 1;
    return true;
}

function isAllowedGardenUrl(raw: string): boolean {
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
        const host = url.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') return true;
        if (host === 'floremoria.com' || host.endsWith('.floremoria.com')) return true;
        // Preview Vercel / staging interni
        if (host.endsWith('.vercel.app') && /floremoria/i.test(host)) return true;
        const siteHost = new URL(getSiteBaseUrl()).hostname.toLowerCase();
        return host === siteHost;
    } catch {
        return false;
    }
}

type ShareEmailBody = {
    gardenUrl?: unknown;
    deceasedName?: unknown;
    senderName?: unknown;
    recipientEmail?: unknown;
    customMessage?: unknown;
};

/**
 * POST /api/memorial/share-email
 * Condivide il Giardino della Memoria Infinita via email transazionale (Resend/SMTP).
 */
export async function POST(request: NextRequest) {
    try {
        const ip = clientIp(request);
        if (!allowRate(ip)) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Ha raggiunto il limite di invii orari. Riprovi più tardi.',
                },
                { status: 429 }
            );
        }

        const rawText = await request.text();
        let body: ShareEmailBody;
        try {
            body = rawText ? (JSON.parse(rawText) as ShareEmailBody) : {};
        } catch {
            return NextResponse.json(
                { success: false, error: 'Body JSON non valido.' },
                { status: 400 }
            );
        }

        const gardenUrl = typeof body.gardenUrl === 'string' ? body.gardenUrl.trim() : '';
        const deceasedName =
            typeof body.deceasedName === 'string' ? body.deceasedName.trim().slice(0, 120) : '';
        const senderName =
            typeof body.senderName === 'string' ? body.senderName.trim().slice(0, 120) : '';
        const recipientEmail =
            typeof body.recipientEmail === 'string'
                ? body.recipientEmail.trim().toLowerCase()
                : '';
        const customMessage =
            typeof body.customMessage === 'string'
                ? body.customMessage.trim().slice(0, 1000)
                : '';

        if (!recipientEmail || !isValidEmailForBlacklist(recipientEmail)) {
            return NextResponse.json(
                { success: false, error: 'Indirizzo email del destinatario non valido.' },
                { status: 400 }
            );
        }

        if (!gardenUrl || !isAllowedGardenUrl(gardenUrl)) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Link del Giardino non valido. Deve essere un URL HTTPS FloreMoria.',
                },
                { status: 400 }
            );
        }

        const subject = buildMemorialShareEmailSubject(deceasedName, senderName);
        const html = buildMemorialShareEmailHtml({
            gardenUrl,
            deceasedName,
            senderName,
            customMessage: customMessage || null,
        });
        const text = buildMemorialShareEmailText({
            gardenUrl,
            deceasedName,
            senderName,
            customMessage: customMessage || null,
        });

        const result = await sendFloremTransactionalMail({
            to: recipientEmail,
            subject,
            html,
            text,
            replyTo: undefined,
        });

        if (!result.ok) {
            console.error('[memorial/share-email] Invio fallito:', result.error);
            return NextResponse.json(
                {
                    success: false,
                    error:
                        'Invio email non riuscito al momento. Riprovi tra poco o condivida il link via WhatsApp.',
                },
                { status: 502 }
            );
        }

        console.info(
            `[memorial/share-email] OK to=${recipientEmail} deceased=${deceasedName.slice(0, 40)} ip=${ip}`
        );

        return NextResponse.json({
            success: true,
            message: 'Email inviata con cura.',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Errore imprevisto.';
        console.error('[memorial/share-email]', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
