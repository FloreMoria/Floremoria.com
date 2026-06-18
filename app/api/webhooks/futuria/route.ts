import { NextResponse } from 'next/server';
import { secureCompareString } from '@/lib/secureCompare';
import { handleFuturiaWebhookPayload, type FuturiaWebhookPayload } from '@/lib/futuria/webhookHandlers';

export const runtime = 'nodejs';

function unauthorized(): NextResponse {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
}

function verifyFuturiaWebhookAuth(request: Request): boolean {
    const secret = process.env.FUTURIA_WEBHOOK_SECRET?.trim();
    if (!secret) {
        // In dev permette test locali; in prod logga warning ma non blocca finché il segreto non è impostato.
        if (process.env.NODE_ENV === 'production') {
            console.warn('[futuria-webhook] FUTURIA_WEBHOOK_SECRET assente: endpoint non autenticato.');
        }
        return true;
    }

    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
        return secureCompareString(authHeader.slice(7).trim(), secret);
    }

    const headerSecret =
        request.headers.get('x-futuria-webhook-secret') ||
        request.headers.get('x-webhook-secret') ||
        '';
    if (headerSecret && secureCompareString(headerSecret.trim(), secret)) {
        return true;
    }

    return false;
}

async function parseWebhookBody(request: Request): Promise<FuturiaWebhookPayload> {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        const json = await request.json();
        return typeof json === 'object' && json !== null ? (json as FuturiaWebhookPayload) : {};
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
        const form = await request.formData();
        const payload: FuturiaWebhookPayload = {};
        form.forEach((value, key) => {
            payload[key] = typeof value === 'string' ? value : String(value);
        });
        return payload;
    }

    const raw = await request.text();
    if (!raw.trim()) return {};

    try {
        return JSON.parse(raw) as FuturiaWebhookPayload;
    } catch {
        return { rawBody: raw };
    }
}

/** Health check per verifica URL in Futuria / workflow automations. */
export async function GET() {
    return NextResponse.json({
        success: true,
        service: 'floremoria-futuria-webhook',
        status: 'ready',
    });
}

/**
 * Webhook Futuria CRM — riceve trigger HTTP POST da automazioni / messaggistica.
 * - floremAction florist_delivery_link → WhatsApp fiorista con link mini-app
 * - delivery proof → Magic Link + WhatsApp cliente
 */
export async function POST(request: Request) {
    try {
        if (!verifyFuturiaWebhookAuth(request)) {
            return unauthorized();
        }

        const payload = await parseWebhookBody(request);
        console.info('[futuria-webhook] Payload ricevuto:', JSON.stringify(payload).slice(0, 1200));

        const result = await handleFuturiaWebhookPayload(payload);

        if (!result.handled) {
            return NextResponse.json({
                success: true,
                received: true,
                handled: false,
                message: 'Evento registrato; nessuna azione configurata per questo tipo.',
                event: result.event,
            });
        }

        return NextResponse.json({
            success: true,
            received: true,
            ...result,
        });
    } catch (error) {
        console.error('[futuria-webhook] Errore:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'internal_error',
            },
            { status: 500 }
        );
    }
}
