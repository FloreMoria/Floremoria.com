/**
 * Webhook inbound assistenza@floremoria.com — POSTMAN in tempo reale.
 *
 * Provider primario: Resend `email.received` (+ fetch body via Receiving API).
 * Fallback auth: Bearer ASSISTENZA_EMAIL_WEBHOOK_SECRET (test / forwarder custom).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { MailboxConfigError } from '@/lib/postman/mailbox';
import { PostmanConfigError } from '@/lib/postman/agent';
import { processAssistenzaInboundEmail } from '@/lib/postman/processAssistenzaEmail';
import {
    extractPlainTextFromResendEmail,
    fetchResendReceivedEmail,
    getAssistenzaInboundAddresses,
    isAssistenzaRecipient,
    isResendEmailReceivedEvent,
    parseResendFromHeader,
    verifyResendSvixWebhook,
    type ResendEmailReceivedEvent,
} from '@/lib/postman/resendReceiving';
import { triggerPostmanBackgroundSync } from '@/lib/postman/triggerBackgroundSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isBearerAuthorized(request: NextRequest): boolean {
    const secret = process.env.ASSISTENZA_EMAIL_WEBHOOK_SECRET?.trim();
    if (!secret) return process.env.NODE_ENV !== 'production';

    const auth = request.headers.get('authorization') || '';
    if (auth.replace(/^Bearer\s+/i, '').trim() === secret) return true;

    const headerKey = request.headers.get('x-webhook-secret')?.trim();
    return headerKey === secret;
}

function verifyRequest(request: NextRequest, rawBody: string): boolean {
    const svixSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    const svixId = request.headers.get('svix-id') || '';
    const svixTimestamp = request.headers.get('svix-timestamp') || '';
    const svixSignature = request.headers.get('svix-signature') || '';

    if (svixSecret && svixId && svixTimestamp && svixSignature) {
        return verifyResendSvixWebhook({
            rawBody,
            svixId,
            svixTimestamp,
            svixSignature,
            secret: svixSecret,
        });
    }

    return isBearerAuthorized(request);
}

interface GenericInboundPayload {
    fromEmail?: string;
    from?: string;
    fromName?: string;
    subject?: string;
    text?: string;
    messageId?: string;
    references?: string;
}

function normalizeGenericPayload(body: GenericInboundPayload): {
    fromName?: string;
    fromEmail: string;
    subject?: string;
    text?: string;
    messageId?: string | null;
    references?: string | null;
} | null {
    const fromEmail = (body.fromEmail || body.from || '').trim().toLowerCase();
    if (!fromEmail) return null;

    return {
        fromName: body.fromName,
        fromEmail,
        subject: body.subject,
        text: body.text,
        messageId: body.messageId || null,
        references: body.references || null,
    };
}

async function handleResendInbound(event: ResendEmailReceivedEvent) {
    const data = event.data;

    const recipients = [...(data.to || []), ...(data.received_for || [])];
    if (recipients.length && !isAssistenzaRecipient(recipients)) {
        return { ok: true, skipped: 'not_assistenza_recipient' as const };
    }

    const full = await fetchResendReceivedEmail(data.email_id);
    const text = extractPlainTextFromResendEmail(full);
    const headerFrom = full.headers?.from || full.from || data.from;
    const { fromName, fromEmail } = parseResendFromHeader(headerFrom);

    if (!fromEmail) {
        return { ok: true, skipped: 'no_sender' as const };
    }

    const messageId =
        full.message_id ||
        data.message_id ||
        full.headers?.['message-id'] ||
        full.headers?.['Message-ID'] ||
        null;

    const references = full.headers?.references || full.headers?.References || null;

    const result = await processAssistenzaInboundEmail({
        fromName,
        fromEmail,
        subject: full.subject || data.subject,
        text,
        messageId,
        references,
    });

    return { ok: true, provider: 'resend' as const, emailId: data.email_id, ...result };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const rawBody = await request.text();

    if (!verifyRequest(request, rawBody)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
        body = JSON.parse(rawBody) as unknown;
    } catch {
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    if (isResendEmailReceivedEvent(body)) {
        try {
            const result = await handleResendInbound(body);
            return NextResponse.json(result);
        } catch (e) {
            if (e instanceof MailboxConfigError || e instanceof PostmanConfigError) {
                return NextResponse.json({ error: 'not_configured', detail: e.message }, { status: 503 });
            }
            const msg = e instanceof Error ? e.message : String(e);
            console.error('[assistenza-email] Resend inbound error:', msg);
            return NextResponse.json({ error: 'process_failed', detail: msg }, { status: 500 });
        }
    }

    const generic = normalizeGenericPayload(body as GenericInboundPayload);
    if (!generic?.fromEmail) {
        return NextResponse.json({ ok: true, skipped: 'unsupported_event' });
    }

    try {
        const result = await processAssistenzaInboundEmail(generic);
        return NextResponse.json({ ok: true, provider: 'generic', ...result });
    } catch (e) {
        if (e instanceof MailboxConfigError || e instanceof PostmanConfigError) {
            return NextResponse.json({ error: 'not_configured', detail: e.message }, { status: 503 });
        }
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: 'process_failed', detail: msg }, { status: 500 });
    }
}

export async function GET(): Promise<NextResponse> {
    void triggerPostmanBackgroundSync();

    return NextResponse.json({
        status: 'ok',
        service: 'POSTMAN assistenza email webhook',
        mailbox: process.env.ASSISTENZA_EMAIL_USER?.trim() || 'assistenza@floremoria.com',
        inboundAliases: getAssistenzaInboundAddresses(),
        providers: ['resend:email.received', 'generic-json'],
    });
}
