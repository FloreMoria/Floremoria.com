/**
 * Registra inbound.floremoria.com su Resend (receiving) per webhook istantaneo.
 * Non tocca il MX root Aruba (mx.floremoria.com).
 *
 * Dopo lo script:
 * 1. Aggiungi in DNS Aruba il record MX del sottodominio (stampato sotto).
 * 2. In pannello Aruba → assistenza@floremoria.com → Inoltro verso assistenza@inbound.floremoria.com
 *
 * Uso: npx tsx scripts/setup-resend-inbound-subdomain.ts
 */
import '../lib/loadEnvFiles';

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const INBOUND_DOMAIN = process.env.ASSISTENZA_INBOUND_DOMAIN?.trim() || 'inbound.floremoria.com';
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
    data: Array<{ id: string; name: string; status: string; capabilities: { receiving: string } }>;
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

async function main() {
    console.log(`═══ Resend inbound subdomain: ${INBOUND_DOMAIN} ═══\n`);

    const domains = await resend<DomainList>('/domains');
    let domain = domains.data.find((d) => d.name === INBOUND_DOMAIN);

    if (!domain) {
        console.log('→ Registro dominio su Resend…');
        const created = await resend<{ id: string; name: string }>('/domains', {
            method: 'POST',
            body: JSON.stringify({ name: INBOUND_DOMAIN }),
        });
        domain = { id: created.id, name: created.name, status: 'pending', capabilities: { receiving: 'disabled' } };
    }

    console.log(`Dominio: ${domain.name} (${domain.id})`);

    if (domain.capabilities.receiving !== 'enabled') {
        console.log('→ Abilito receiving…');
        await resend(`/domains/${domain.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ capabilities: { receiving: 'enabled' } }),
        });
    }

    const detail = await resend<DomainDetail>(`/domains/${domain.id}`);
    const mx = detail.records.find((r) => r.record === 'Receiving' && r.type === 'MX');

    console.log('\n── DNS Aruba (solo sottodominio, il MX root resta invariato) ──');
    if (mx) {
        const host = mx.name ? `${mx.name}.${INBOUND_DOMAIN.split('.').slice(1).join('.')}` : INBOUND_DOMAIN;
        console.log(`Tipo: MX`);
        console.log(`Host: ${mx.name || 'inbound'}`);
        console.log(`Valore: ${mx.value}`);
        console.log(`Priorità: ${mx.priority}`);
        console.log(`Stato Resend: ${mx.status}`);
        console.log(`\nIndirizzo ricezione: assistenza@${INBOUND_DOMAIN}`);
        console.log(`\n── Inoltro Aruba (obbligatorio finché MX root è su Aruba) ──`);
        console.log(`assistenza@floremoria.com  →  assistenza@${INBOUND_DOMAIN}`);
        console.log(`(Pannello Aruba → casella assistenza@ → Inoltro automatico)`);
    } else {
        console.log('Record MX receiving non trovato — controlla dashboard Resend.');
    }

    console.log('\n── Webhook (già su floremoria.com) ──');
    console.log(WEBHOOK_URL);

    console.log('\n── Variabile Vercel opzionale ──');
    console.log(`ASSISTENZA_INBOUND_ALIASES=assistenza@${INBOUND_DOMAIN}`);

    console.log('\n✔ Setup subdomain completato.');
}

main().catch((e) => {
    console.error('Errore:', e instanceof Error ? e.message : e);
    process.exit(1);
});
