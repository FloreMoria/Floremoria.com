/**
 * Ampiezza incidente: email Resend 2026 a fioristi con dati cliente / prezzo vendita.
 * Criterio: subject tipico fiorista + (nel subject o metadati) pattern cliente, oppure
 * destinatario = email Partner FLORIST e subject «Nuovo ordine FloreMoria».
 */
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '@prisma/client';

type ResendListedEmail = {
    id: string;
    to?: string[];
    from?: string | null;
    subject?: string | null;
    created_at?: string;
    last_event?: string | null;
};

const prisma = new PrismaClient();

async function listResend(beforeId?: string): Promise<ResendListedEmail[]> {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw new Error('RESEND_API_KEY mancante');
    const qs = new URLSearchParams({ limit: '100' });
    if (beforeId) qs.set('before', beforeId);
    const res = await fetch(`https://api.resend.com/emails?${qs}`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data?: ResendListedEmail[] };
    return Array.isArray(json.data) ? json.data : [];
}

async function main() {
    const florists = await prisma.partner.findMany({
        where: { partnerType: 'FLORIST', deletedAt: null },
        select: { email: true, pecAddress: true, shopName: true },
    });
    const floristEmails = new Set<string>();
    for (const f of florists) {
        if (f.email?.includes('@')) floristEmails.add(f.email.trim().toLowerCase());
        if (f.pecAddress?.includes('@')) floristEmails.add(f.pecAddress.trim().toLowerCase());
    }

    const hits: Array<{
        date: string;
        to: string;
        subject: string;
        orderHint: string | null;
        last_event: string | null;
        id: string;
    }> = [];

    let before: string | undefined;
    let scanned = 0;
    for (let page = 0; page < 80; page++) {
        const batch = await listResend(before);
        if (!batch.length) break;
        scanned += batch.length;
        for (const e of batch) {
            const created = e.created_at || '';
            if (created && created < '2026-01-01') {
                // lista recent→old: possiamo fermarci
                console.log(JSON.stringify({ scanned, hits: hits.length, sample: hits.slice(0, 50) }, null, 2));
                await prisma.$disconnect();
                return;
            }
            if (!created.startsWith('2026')) continue;
            const toList = (e.to || []).map((t) => String(t).toLowerCase());
            const subject = e.subject || '';
            const isFloristRecipient = toList.some((t) => floristEmails.has(t));
            const isFloristSubject =
                /^nuovo ordine floremoria/i.test(subject) ||
                /consegna da effettuare/i.test(subject);
            if (!isFloristRecipient && !isFloristSubject) continue;

            // Sospetto leak: subject staff riusato o destinatario fiorista con subject staff
            const staffLeakSubject =
                /ordine pagato/i.test(subject) ||
                /id sessione stripe/i.test(subject);
            // Subject «Nuovo ordine FloreMoria … consegna» era il path incidente (staff HTML)
            const incidentPath = isFloristSubject && isFloristRecipient;

            if (staffLeakSubject || incidentPath) {
                const orderMatch = subject.match(/\b([A-Z]{2}-[A-Z]{2}-\d{2}-\d{3,5})\b/);
                hits.push({
                    date: created.slice(0, 19).replace('T', ' '),
                    to: toList.join(', '),
                    subject,
                    orderHint: orderMatch?.[1] ?? null,
                    last_event: e.last_event ?? null,
                    id: e.id,
                });
            }
        }
        before = batch[batch.length - 1]?.id;
        const oldest = batch[batch.length - 1]?.created_at || '';
        if (oldest && oldest < '2026-01-01') break;
    }

    console.log(
        JSON.stringify(
            {
                scanned,
                floristEmailCount: floristEmails.size,
                suspiciousCount: hits.length,
                hits,
            },
            null,
            2
        )
    );
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
