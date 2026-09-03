/**
 * Audit rapido invii email Resend per ordini Partner B2B test.
 *
 * Uso:
 *   npx tsx scripts/audit-partner-order-emails.ts
 *
 * Assunzione: Resend permette `GET /emails` (list sent emails) e la lista
 * contiene `id`, `to[]`, `subject`, `created_at`, `last_event`.
 */

import prisma from '@/lib/prisma';
import { resolveOrderBuyerEmail } from '@/lib/orders/resolveOrderBuyerContact';

type ResendListedEmail = {
    id: string;
    message_id?: string | null;
    to?: string[];
    from?: string | null;
    subject?: string | null;
    created_at?: string;
    last_event?: string | null;
};

function assertNonEmpty(value: string | null | undefined, msg: string): string {
    const v = value?.trim();
    if (!v) throw new Error(msg);
    return v;
}

async function listResendEmailsPage(args: { limit: number; beforeId?: string }): Promise<{
    data: ResendListedEmail[];
    has_more: boolean;
}> {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw new Error('RESEND_API_KEY mancante in env.');

    const qs = new URLSearchParams({ limit: String(args.limit) });
    if (args.beforeId) qs.set('before', args.beforeId);

    const res = await fetch(`https://api.resend.com/emails?${qs.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`Resend GET /emails ${res.status}: ${t.slice(0, 500)}`);
    }

    const json = (await res.json()) as { data?: ResendListedEmail[] };
    return {
        data: Array.isArray(json.data) ? json.data : [],
        has_more: Boolean((json as any).has_more),
    };
}

function pickLatestMatch(args: {
    emails: ResendListedEmail[];
    to: string | null;
    subjectNeedle: string | null;
}): { found: boolean; resendId?: string; lastEvent?: string; to?: string; subject?: string } {
    const { emails, to, subjectNeedle } = args;
    if (!to) return { found: false };

    const needle = subjectNeedle?.trim();
    const matches = emails.filter((e) => {
        const toList = (e.to ?? []).map((x) => String(x).toLowerCase());
        const toLower = to.toLowerCase();
        if (!toList.includes(toLower)) return false;
        if (needle) {
            const subject = (e.subject ?? '').toLowerCase();
            if (!subject.includes(needle.toLowerCase())) return false;
        }
        return true;
    });

    if (matches.length === 0) return { found: false };
    // La lista Resend è ordinata recent → vecchio: prendo il primo.
    const first = matches[0]!;
    return {
        found: true,
        resendId: first.id,
        lastEvent: first.last_event ?? undefined,
        to: first.to?.[0],
        subject: first.subject ?? undefined,
    };
}

async function main(): Promise<void> {
    const STAFF_FALLBACK = 'staff.floremoria@gmail.com';
    const staffEmail = process.env.FLOREM_STAFF_ORDERS_EMAIL?.trim() || STAFF_FALLBACK;
    const buyerSearchName = 'Roberta Casco';
    const partnerChannel = 'ANNUNCI_FUNEBRI';

    const order = await prisma.order.findFirst({
        where: {
            isTest: true,
            partnershipChannel: partnerChannel,
            OR: [
                { buyerFullName: { contains: buyerSearchName, mode: 'insensitive' } },
                { deceasedName: { contains: buyerSearchName, mode: 'insensitive' } },
            ],
            deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            orderNumber: true,
            partnershipChannel: true,
            isTest: true,
            buyerFullName: true,
            buyerEmail: true,
            deceasedName: true,
            partnerNotifyEmail: true,
            createdAt: true,
            agencyName: true,
            agencyId: true,
            agency: {
                select: {
                    aggregatorNotificationEmail: true,
                    shopName: true,
                    agencyNotificationEmail: true,
                },
            },
            referralPartner: {
                select: {
                    aggregatorNotificationEmail: true,
                    email: true,
                    shopName: true,
                },
            },
        },
    });

    if (!order) {
        console.error('[audit-partner-order-emails] Nessun ordine test trovato per Roberta Casco + ANNUNCI_FUNEBRI.');
        process.exit(1);
    }

    const buyerEmail = resolveOrderBuyerEmail(order) ?? null;
    const partnerNotifyEmail = order.partnerNotifyEmail ?? null;

    // Come in sendPartnerOrderNotifications:
    // aggregatorTo = agency.aggregatorNotificationEmail || referral.aggregatorNotificationEmail || referral.email || order.partnerNotifyEmail
    const expectedPartnerTo =
        order.agency?.aggregatorNotificationEmail?.trim() ||
        order.referralPartner?.aggregatorNotificationEmail?.trim() ||
        order.referralPartner?.email?.trim() ||
        partnerNotifyEmail;

    console.log('=== Audit Resend — ordine test ===');
    console.log({
        orderId: order.id,
        orderNumber: order.orderNumber,
        partnershipChannel: order.partnershipChannel,
        isTest: order.isTest,
        buyerFullName: order.buyerFullName,
        buyerEmail,
        partnerNotifyEmail,
        staffEmail,
        createdAt: order.createdAt?.toISOString?.(),
    });

    // Needle sul subject: basta contenere orderNumber.
    const orderNeedle = order.orderNumber || order.id.substring(order.id.length - 6).toUpperCase();

    const staffNeedle = orderNeedle;
    const partnerNeedle = orderNeedle;
    const buyerNeedle = `Conferma ordine ${orderNeedle}`;

    let staff = { found: false as boolean };
    let partner = { found: false as boolean };
    let buyer = { found: false as boolean };

    // Anche: ultimo evento per solo destinatario (no subject), per diagnosi.
    let staffLatestTo = { found: false as boolean };
    let partnerLatestTo = { found: false as boolean };
    let buyerLatestTo = { found: false as boolean };

    let beforeId: string | undefined = undefined;
    const maxPages = 6;

    for (let page = 0; page < maxPages; page++) {
        const pageRes = await listResendEmailsPage({ limit: 100, beforeId });
        const emails = pageRes.data;
        if (!emails.length) break;

        if (!staffLatestTo.found) {
            staffLatestTo = pickLatestMatch({ emails, to: staffEmail, subjectNeedle: null });
        }
        if (!partnerLatestTo.found) {
            partnerLatestTo = pickLatestMatch({ emails, to: expectedPartnerTo ?? null, subjectNeedle: null });
        }
        if (!buyerLatestTo.found) {
            buyerLatestTo = pickLatestMatch({ emails, to: buyerEmail, subjectNeedle: null });
        }

        if (!staff.found) {
            staff = pickLatestMatch({
                emails,
                to: staffEmail,
                subjectNeedle: staffNeedle,
            });
        }
        if (!partner.found) {
            partner = pickLatestMatch({
                emails,
                to: expectedPartnerTo ?? null,
                subjectNeedle: partnerNeedle,
            });
        }
        if (!buyer.found) {
            buyer = pickLatestMatch({
                emails,
                to: buyerEmail,
                subjectNeedle: buyerNeedle,
            });
        }

        if (staff.found && partner.found && buyer.found) break;
        if (!pageRes.has_more) break;

        // Per paginare indietro: usa l'id del primo elemento della pagina corrente.
        beforeId = emails[0]!.id;
    }

    console.log('\n=== Esito invii (Resend / GET /emails) ===');
    console.log(
        `[Partner Order Email] Staff: ${staff.found ? 'OK' : 'NOT_FOUND'} resendId=${(staff as any).resendId ?? '-'} last_event=${(staff as any).lastEvent ?? '-'}`
    );
    console.log(
        `[Partner Order Email] Partner: ${partner.found ? 'OK' : 'NOT_FOUND'} resendId=${(partner as any).resendId ?? '-'} last_event=${(partner as any).lastEvent ?? '-'}`
    );
    console.log(
        `[Partner Order Email] Buyer: ${buyer.found ? 'OK' : 'NOT_FOUND'} resendId=${(buyer as any).resendId ?? '-'} last_event=${(buyer as any).lastEvent ?? '-'}`
    );

    console.log('\n=== Diagnosi: ultimo invio Resend per destinatario (no subject match) ===');
    console.log(
        `[Partner Order Email] StaffLatestTo: ${staffLatestTo.found ? 'FOUND' : 'NOT_FOUND'} to=${(staffLatestTo as any).to ?? '-'} resendId=${(staffLatestTo as any).resendId ?? '-'} subject="${(staffLatestTo as any).subject ?? '-'}"`
    );
    console.log(
        `[Partner Order Email] PartnerLatestTo: ${partnerLatestTo.found ? 'FOUND' : 'NOT_FOUND'} to=${(partnerLatestTo as any).to ?? '-'} resendId=${(partnerLatestTo as any).resendId ?? '-'} subject="${(partnerLatestTo as any).subject ?? '-'}"`
    );
    console.log(
        `[Partner Order Email] BuyerLatestTo: ${buyerLatestTo.found ? 'FOUND' : 'NOT_FOUND'} to=${(buyerLatestTo as any).to ?? '-'} resendId=${(buyerLatestTo as any).resendId ?? '-'} subject="${(buyerLatestTo as any).subject ?? '-'}"`
    );

    if (!buyer.found || !partner.found) process.exit(2);
}

main().catch((err) => {
    console.error('[audit-partner-order-emails] FAILED:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});

