import nodemailer from 'nodemailer';

export type SendFloremMailParams = {
    to: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    subject: string;
    html: string;
    text?: string;
};

function asList(v: string | string[] | undefined): string[] | undefined {
    if (!v) return undefined;
    return Array.isArray(v) ? v : [v];
}

async function sendViaResend(from: string, params: SendFloremMailParams): Promise<{ ok: boolean; error?: string }> {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { ok: false, error: 'missing_resend' };

    const to = asList(params.to);
    if (!to?.length) return { ok: false, error: 'missing_to' };

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to,
            bcc: asList(params.bcc),
            reply_to: params.replyTo,
            subject: params.subject,
            html: params.html,
            text: params.text,
        }),
    });

    if (!res.ok) {
        const t = await res.text();
        return { ok: false, error: t.slice(0, 800) };
    }
    return { ok: true };
}

async function sendViaSmtp(from: string, params: SendFloremMailParams): Promise<{ ok: boolean; error?: string }> {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return { ok: false, error: 'missing_smtp' };

    const port = Number(process.env.SMTP_PORT || '587');
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
    });

    const to = asList(params.to);
    if (!to?.length) return { ok: false, error: 'missing_to' };

    await transporter.sendMail({
        from,
        to: to.join(', '),
        bcc: asList(params.bcc)?.join(', '),
        replyTo: params.replyTo,
        subject: params.subject,
        html: params.html,
        text: params.text,
    });
    return { ok: true };
}

/**
 * Invio transazionale server-side: Resend (priorità) oppure SMTP (Aruba/Google Workspace, ecc.).
 * Richiede `FLOREM_MAIL_FROM` (es. "FloreMoria <assistenza@floremoria.com>").
 */
export async function sendFloremTransactionalMail(params: SendFloremMailParams): Promise<{ ok: boolean; error?: string }> {
    const from = process.env.FLOREM_MAIL_FROM?.trim();
    if (!from) {
        console.error('[mail] FLOREM_MAIL_FROM mancante: impossibile inviare.');
        return { ok: false, error: 'missing_from' };
    }

    try {
        if (process.env.RESEND_API_KEY?.trim()) {
            return await sendViaResend(from, params);
        }
        if (process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()) {
            return await sendViaSmtp(from, params);
        }
        console.error('[mail] Nessun provider: imposta RESEND_API_KEY oppure SMTP_HOST + SMTP_USER + SMTP_PASS');
        return { ok: false, error: 'no_provider' };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[mail] Errore invio:', msg);
        return { ok: false, error: msg };
    }
}
