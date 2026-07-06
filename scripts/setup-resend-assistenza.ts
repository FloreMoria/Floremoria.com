/**
 * Configura Resend per assistenza@floremoria.com:
 * - abilita receiving sul dominio floremoria.com (se disabilitato)
 * - crea webhook email.received → /api/webhooks/assistenza-email
 * - stampa record MX e variabili Vercel da impostare
 *
 * Uso: npx tsx scripts/setup-resend-assistenza.ts
 */
import '../lib/loadEnvFiles';

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const WEBHOOK_URL =
    process.env.ASSISTENZA_EMAIL_WEBHOOK_URL?.trim() ||
    `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.floremoria.com').replace(/\/$/, '')}/api/webhooks/assistenza-email`;

async function resend<T>(path: string, init?: RequestInit): Promise<T> {
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY mancante in .env.local');
    const res = await fetch(`https://api.resend.com${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
        },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${init?.method || 'GET'} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    return text ? (JSON.parse(text) as T) : ({} as T);
}

interface DomainList {
    data: Array<{
        id: string;
        name: string;
        status: string;
        capabilities: { sending: string; receiving: string };
    }>;
}

interface DomainDetail {
    id: string;
    name: string;
    status: string;
    capabilities: { sending: string; receiving: string };
    records: Array<{
        record: string;
        name: string;
        type: string;
        value: string;
        priority?: number;
        status: string;
    }>;
}

interface WebhookList {
    data: Array<{ id: string; endpoint: string; events: string[]; signing_secret?: string }>;
}

interface WebhookCreate {
    id: string;
    signing_secret: string;
}

async function main() {
    console.log('═══ Setup Resend assistenza@floremoria.com ═══\n');

    const domains = await resend<DomainList>('/domains');
    const domain = domains.data.find((d) => d.name === 'floremoria.com');
    if (!domain) {
        throw new Error('Dominio floremoria.com non trovato su Resend.');
    }

    console.log(`Dominio: ${domain.name} (${domain.id})`);
    console.log(`Stato: ${domain.status}`);
    console.log(`Sending: ${domain.capabilities.sending} | Receiving: ${domain.capabilities.receiving}`);

    if (domain.capabilities.receiving !== 'enabled') {
        console.log('\n→ Abilito receiving…');
        await resend(`/domains/${domain.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ capabilities: { receiving: 'enabled' } }),
        });
    }

    const detail = await resend<DomainDetail>(`/domains/${domain.id}`);
    const mx = detail.records.find((r) => r.record === 'Receiving' && r.type === 'MX');

    console.log('\n── Record DNS receiving (da aggiungere se usi MX Resend) ──');
    if (mx) {
        console.log(`MX  @${mx.name || 'floremoria.com'}  priority ${mx.priority}  →  ${mx.value}`);
        console.log(`Stato MX: ${mx.status}`);
    } else {
        console.log('Nessun record MX receiving trovato — controlla dashboard Resend.');
    }

    console.log('\n── Webhook ──');
    const hooks = await resend<WebhookList>('/webhooks');
    const existing = hooks.data.find(
        (h) => h.endpoint === WEBHOOK_URL && h.events.includes('email.received')
    );

    let signingSecret = existing?.signing_secret;
    if (existing) {
        console.log(`Webhook già presente: ${existing.id}`);
        console.log(`Endpoint: ${existing.endpoint}`);
        if (!signingSecret) {
            console.log('(signing_secret visibile solo alla creazione — recuperalo da dashboard Resend → Webhooks)');
        }
    } else {
        console.log(`→ Creo webhook → ${WEBHOOK_URL}`);
        const created = await resend<WebhookCreate>('/webhooks', {
            method: 'POST',
            body: JSON.stringify({
                endpoint: WEBHOOK_URL,
                events: ['email.received'],
            }),
        });
        signingSecret = created.signing_secret;
        console.log(`Webhook creato: ${created.id}`);
    }

    console.log('\n── Variabili da impostare su Vercel Production ──');
    console.log('RESEND_API_KEY=… (già presente)');
    if (signingSecret) {
        console.log(`RESEND_WEBHOOK_SECRET=${signingSecret}`);
    } else {
        console.log('RESEND_WEBHOOK_SECRET=whsec_… (da dashboard Resend Webhooks)');
    }
    console.log(`ASSISTENZA_EMAIL_WEBHOOK_SECRET=${process.env.ASSISTENZA_EMAIL_WEBHOOK_SECRET?.trim() || process.env.POSTMAN_CRON_SECRET?.trim() || '<genera-un-segreto>'}`);
    console.log('ASSISTENZA_EMAIL_USER=assistenza@floremoria.com');
    console.log('ASSISTENZA_EMAIL_PASSWORD=… (SMTP Aruba per le risposte)');

    console.log('\n── Coesistenza con casella Aruba ──');
    console.log('Opzione A (consigliata): in Aruba imposta INOLTRO da assistenza@ verso un indirizzo che Resend riceve');
    console.log('  (dopo aver verificato MX receiving su floremoria.com O usando sottodominio dedicato).');
    console.log('Opzione B: MX root su Resend — interrompe la casella Aruba attuale.');
    console.log('Opzione C (fallback): cron esterno su /api/cron/postman-sync ogni 2-5 min (IMAP Aruba).');

    console.log('\n✔ Setup script completato.');
}

main().catch((e) => {
    console.error('Errore setup Resend:', e instanceof Error ? e.message : e);
    process.exit(1);
});
