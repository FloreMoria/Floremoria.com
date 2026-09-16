/**
 * Audit Resend 2026: email il cui corpo contiene email/telefono cliente o prezzo vendita,
 * e destinatario NON interno. Ampiezza reale (contenuto, non path).
 */
import 'dotenv/config';
import { config } from 'dotenv';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

config({ path: '.env' });
config({ path: '.env.local' });

if (process.env.FORCE_NEON === '1') {
    const envFile = fs.readFileSync('.env', 'utf8');
    const m = envFile.match(/^DATABASE_URL=(.+)$/m);
    if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        process.env.DATABASE_URL = v;
    }
}

const prisma = new PrismaClient();

const INTERNAL_SUFFIXES = [
    '@floremoria.com',
    '@floremoria.eu',
    '@annuncifunebri.it', // partner B2B master — ops trasparenza, non fiorista
];
const INTERNAL_EXACT = new Set([
    'salvatoremarsigliore@gmail.com', // titolare — interno operativo (anomalia se usato come fiorista)
    'staff.floremoria@gmail.com',
    'stafffloremoria@gmail.com',
]);

type Listed = {
    id: string;
    to?: string[];
    subject?: string | null;
    created_at?: string;
    last_event?: string | null;
};

function isInternal(email: string): boolean {
    const e = email.trim().toLowerCase();
    if (!e) return true;
    if (INTERNAL_EXACT.has(e)) return true;
    return INTERNAL_SUFFIXES.some((s) => e.endsWith(s));
}

function bodyHasLeakSignals(html: string): {
    hit: boolean;
    reasons: string[];
} {
    const reasons: string[] = [];
    const text = html || '';
    // Marker tipici del modello staff riusato verso esterni
    if (/ID Sessione Stripe/i.test(text) && /Nuovo ordine assegnato/i.test(text)) {
        reasons.push('staff_stripe_session_reuse');
    }
    if (/Totale Ordine/i.test(text) || /Totale ordine/i.test(text)) {
        reasons.push('totale_ordine_label');
    }
    if (/<th[^>]*>\s*Cliente\s*<\/th>/i.test(text) || />Cliente<\/td>/i.test(text) || /<strong>Cliente/i.test(text)) {
        reasons.push('cliente_label');
    }
    if (/\bTelefono\b/i.test(text) && /(\+39|tel:)/i.test(text)) {
        reasons.push('telefono_pattern');
    }
    // email in body (non solo nel to)
    const emails = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    const nonInternalEmails = emails.filter((x) => !isInternal(x) && !x.includes('floremoria'));
    if (nonInternalEmails.length >= 1 && (/Email/i.test(text) || /Cliente/i.test(text))) {
        reasons.push('email_in_body');
    }
    // prezzo vendita tipico €xx,xx vicino a Totale
    if (/€\s*\d+[.,]\d{2}/.test(text) && /Totale/i.test(text)) {
        reasons.push('prezzo_con_totale');
    }
    return { hit: reasons.length > 0, reasons: [...new Set(reasons)] };
}

async function listAll(): Promise<Listed[]> {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw new Error('RESEND_API_KEY mancante');
    const all: Listed[] = [];
    let before: string | undefined;
    for (let page = 0; page < 50; page++) {
        const qs = new URLSearchParams({ limit: '100' });
        if (before) qs.set('before', before);
        const res = await fetch(`https://api.resend.com/emails?${qs}`, {
            headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) throw new Error(`Resend list ${res.status}`);
        const j = (await res.json()) as { data?: Listed[] };
        const batch = j.data || [];
        if (!batch.length) break;
        all.push(...batch);
        const last = batch[batch.length - 1];
        before = last.id;
        const created = last.created_at ? new Date(last.created_at) : null;
        if (created && created < new Date('2026-01-01T00:00:00Z')) break;
        if (batch.length < 100) break;
    }
    return all.filter((e) => {
        const d = e.created_at ? new Date(e.created_at) : null;
        return d && d >= new Date('2026-01-01T00:00:00Z') && d < new Date('2027-01-01T00:00:00Z');
    });
}

async function getBody(id: string): Promise<string> {
    const key = process.env.RESEND_API_KEY!.trim();
    const res = await fetch(`https://api.resend.com/emails/${id}`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return '';
    const j = (await res.json()) as { html?: string; text?: string };
    return String(j.html || j.text || '');
}

function extractOrder(subject: string | null | undefined, body: string): string | null {
    const s = `${subject || ''} ${body}`;
    const m = s.match(/\b((?:FF|FT|FA|FP|PT)-[A-Z]{2}-\d{2}-\d{3})\b/);
    return m ? m[1] : null;
}

async function main() {
    const listed = await listAll();
    console.log(`[audit-content] emails 2026 listed: ${listed.length}`);

    const hits: Array<Record<string, unknown>> = [];
    let checked = 0;

    for (const e of listed) {
        const tos = (e.to || []).map((t) => String(t).toLowerCase());
        const externalTos = tos.filter((t) => !isInternal(t));
        if (!externalTos.length) continue;

        const body = await getBody(e.id);
        checked++;
        const { hit, reasons } = bodyHasLeakSignals(body);
        if (!hit) continue;

        // Escludi conferme ordine al cliente stesso (buyer riceve legittimamente i suoi dati)
        const subj = (e.subject || '').toLowerCase();
        const isCustomerConfirm =
            subj.includes('conferma ordine') ||
            subj.includes('ordine confermato') ||
            subj.includes('grazie per il tuo ordine') ||
            subj.includes('la tua presenza');
        if (isCustomerConfirm) continue;

        hits.push({
            date: e.created_at,
            to: externalTos,
            subject: e.subject,
            order: extractOrder(e.subject, body),
            last_event: e.last_event,
            resendId: e.id,
            reasons,
        });
    }

    console.log(JSON.stringify({ checkedExternal: checked, leakHits: hits.length, hits }, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
