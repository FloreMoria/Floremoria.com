/**
 * Dispatcher notifiche multi-canale per ordini Partner B2B (AF / Agenzia diretta).
 * Orchestrazione unica post-creazione: WhatsApp fiorista/cliente + email operative.
 */

import prisma from '@/lib/prisma';
import { sendFloremTransactionalMail } from '@/lib/serverMail';
import { buildOrderCustomerHtml, buildOrderStaffHtml } from '@/lib/orderEmails';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';
import { runPuntoBCustomerOrderConfirm } from '@/lib/vera/orderWorkflow/puntoBCustomerConfirm';
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';

const DEFAULT_AGGREGATOR_EMAIL = 'assistenza@floremoria.com';
const DEFAULT_OPS_EMAIL = 'ordini@floremoria.com';

export type PartnerOrderNotificationChannel =
    | 'whatsapp_florist'
    | 'whatsapp_customer'
    | 'email_customer'
    | 'email_ops'
    | 'email_florist'
    | 'email_aggregator'
    | 'email_agency';

export type PartnerOrderNotificationResult = {
    channel: PartnerOrderNotificationChannel;
    ok: boolean;
    skipped?: string;
    error?: string;
};

function esc(s: string | null | undefined): string {
    if (s == null || s === '') return '—';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatMoney(cents: number): string {
    return `€${(cents / 100).toFixed(2)}`;
}

function buildAgencyTransparencyHtml(params: {
    orderNumber: string | null;
    agencyName: string | null;
    partnershipChannel: string | null;
    deceasedName: string;
    cemeteryName: string;
    cemeteryCity: string;
    deliveryDate: Date | null;
    floristName: string | null;
    totalPriceCents: number;
    audience: 'agency' | 'aggregator';
}): string {
    const title =
        params.audience === 'agency'
            ? 'Notifica ordine — Agenzia Funebre'
            : 'Trasparenza ordine — Provider / Aggregatore';

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;padding:20px;max-width:600px;margin:0 auto;">
  <div style="background:#fff;padding:24px;border:1px solid #eee;border-radius:8px;">
    <h2 style="margin:0 0 8px;font-size:18px;">${esc(title)}</h2>
    <p style="margin:0 0 16px;color:#555;font-size:14px;">
      FloreMoria ha preso in carico un omaggio floreale collegato alla partnership B2B.
    </p>
    <table cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;width:40%;">Ordine</td><td><strong>${esc(params.orderNumber)}</strong></td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Agenzia</td><td>${esc(params.agencyName)}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Canale</td><td>${esc(params.partnershipChannel)}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Defunto</td><td>${esc(params.deceasedName)}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Cimitero</td><td>${esc(params.cemeteryName)} — ${esc(params.cemeteryCity)}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Data consegna</td><td>${params.deliveryDate ? esc(params.deliveryDate.toISOString().slice(0, 10)) : '—'}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Fiorista</td><td>${esc(params.floristName)}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Importo</td><td><strong>${formatMoney(params.totalPriceCents)}</strong></td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#888;">Messaggio automatico FloreMoria — non rispondere a questo indirizzo tecnico.</p>
  </div>
</body>
</html>`.trim();
}

/**
 * Assicura IN_PROGRESS quando c'è un fiorista, così Punto A/B possono partire.
 */
async function ensureInProgressForNotifications(orderId: string, partnerId: string | null): Promise<void> {
    if (!partnerId) return;
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: { id: true, status: true },
    });
    if (!order) return;
    if (order.status === 'IN_PROGRESS' || order.status === 'DELIVERING' || order.status === 'COMPLETED') {
        return;
    }
    if (order.status === 'CANCELLED') return;

    await prisma.order.update({
        where: { id: orderId },
        data: { status: 'IN_PROGRESS', partnerId },
    });
    await onOrderStatusChanged(orderId, 'IN_PROGRESS').catch((err) => {
        console.error('[partner-order-notifications] onOrderStatusChanged failed:', err);
    });
}

/**
 * Scatena in parallelo tutte le notifiche B2B (errori isolati per canale).
 */
export async function sendPartnerOrderNotifications(
    orderId: string,
    options?: { emailsOnly?: boolean; skipCustomer?: boolean; skipOps?: boolean }
): Promise<PartnerOrderNotificationResult[]> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
            items: { include: { product: true } },
            partner: true,
            agency: true,
            referralPartner: true,
        },
    });

    if (!order) {
        return [{ channel: 'email_ops', ok: false, skipped: 'order_not_found' }];
    }

    if (!options?.emailsOnly) {
        await ensureInProgressForNotifications(order.id, order.partnerId);
    }

    const agency = order.agency;
    const referral = order.referralPartner;
    const floristName = order.partner?.shopName ?? null;
    const floristEmail =
        order.partner?.email?.trim() ||
        order.partner?.pecAddress?.trim() ||
        null;
    const opsTo = process.env.FLOREM_STAFF_ORDERS_EMAIL?.trim() || DEFAULT_OPS_EMAIL;
    const aggregatorTo =
        agency?.aggregatorNotificationEmail?.trim() ||
        referral?.aggregatorNotificationEmail?.trim() ||
        referral?.email?.trim() ||
        order.partnerNotifyEmail?.trim() ||
        DEFAULT_AGGREGATOR_EMAIL;
    const agencyTo = agency?.agencyNotificationEmail?.trim() || null;

    const tasks: Array<Promise<PartnerOrderNotificationResult>> = [];

    if (!options?.emailsOnly) {
        // 1) WhatsApp fiorista (Punto A / mini-app)
        tasks.push(
            (async (): Promise<PartnerOrderNotificationResult> => {
                try {
                    const res = await notifyFloristDeliveryLinkForOrder(order.id, { force: true, bypassWindow: true });
                    return {
                        channel: 'whatsapp_florist',
                        ok: res.ok,
                        skipped: res.skipped,
                        error: res.error,
                    };
                } catch (e) {
                    return {
                        channel: 'whatsapp_florist',
                        ok: false,
                        error: e instanceof Error ? e.message : String(e),
                    };
                }
            })()
        );

        // 2) WhatsApp utente (Punto B)
        tasks.push(
            (async (): Promise<PartnerOrderNotificationResult> => {
                try {
                    const res = await runPuntoBCustomerOrderConfirm(order.id, { force: true });
                    return {
                        channel: 'whatsapp_customer',
                        ok: res.ok,
                        skipped: res.skipped,
                        error: res.error,
                    };
                } catch (e) {
                    return {
                        channel: 'whatsapp_customer',
                        ok: false,
                        error: e instanceof Error ? e.message : String(e),
                    };
                }
            })()
        );
    }

    // 3) Email utente (ricevuta)
    if (!options?.skipCustomer) {
        tasks.push(
            (async (): Promise<PartnerOrderNotificationResult> => {
                const buyer = order.buyerEmail?.trim();
                if (!buyer || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer)) {
                    return { channel: 'email_customer', ok: true, skipped: 'no_buyer_email' };
                }
                try {
                    const html = buildOrderCustomerHtml({ order });
                    const r = await sendFloremTransactionalMail({
                        to: buyer,
                        replyTo: process.env.FLOREM_MAIL_REPLY_TO?.trim() || DEFAULT_AGGREGATOR_EMAIL,
                        subject: `Conferma ordine ${order.orderNumber || ''} — FloreMoria`.trim(),
                        html,
                    });
                    return { channel: 'email_customer', ok: r.ok, error: r.error };
                } catch (e) {
                    return {
                        channel: 'email_customer',
                        ok: false,
                        error: e instanceof Error ? e.message : String(e),
                    };
                }
            })()
        );
    }

    // 4) Email operativa FloreMoria
    if (!options?.skipOps) {
        tasks.push(
            (async (): Promise<PartnerOrderNotificationResult> => {
                try {
                    const html = buildOrderStaffHtml({
                        order,
                        stripeSessionId: 'B2B Partner Integration',
                    });
                    const r = await sendFloremTransactionalMail({
                        to: opsTo,
                        subject: `[B2B] Nuovo ordine ${order.orderNumber} — ${order.agencyName || agency?.shopName || 'Partner'}`,
                        html,
                    });
                    return { channel: 'email_ops', ok: r.ok, error: r.error };
                } catch (e) {
                    return {
                        channel: 'email_ops',
                        ok: false,
                        error: e instanceof Error ? e.message : String(e),
                    };
                }
            })()
        );
    }

    // 4b) Email fiorista assegnato
    tasks.push(
        (async (): Promise<PartnerOrderNotificationResult> => {
            if (!floristEmail) {
                return { channel: 'email_florist', ok: true, skipped: 'no_florist_email' };
            }
            try {
                const html = buildOrderStaffHtml({
                    order,
                    stripeSessionId: 'Nuovo ordine assegnato',
                });
                const r = await sendFloremTransactionalMail({
                    to: floristEmail,
                    subject: `Nuovo ordine FloreMoria ${order.orderNumber} — consegna da effettuare`,
                    html,
                });
                return { channel: 'email_florist', ok: r.ok, error: r.error };
            } catch (e) {
                return {
                    channel: 'email_florist',
                    ok: false,
                    error: e instanceof Error ? e.message : String(e),
                };
            }
        })()
    );

    // 5) Email trasparenza aggregatore (AF)
    tasks.push(
        (async (): Promise<PartnerOrderNotificationResult> => {
            if (!aggregatorTo) {
                return { channel: 'email_aggregator', ok: true, skipped: 'no_aggregator_email' };
            }
            try {
                const html = buildAgencyTransparencyHtml({
                    orderNumber: order.orderNumber,
                    agencyName: order.agencyName || agency?.shopName || null,
                    partnershipChannel: order.partnershipChannel || agency?.partnershipChannel || null,
                    deceasedName: order.deceasedName,
                    cemeteryName: order.cemeteryName,
                    cemeteryCity: order.cemeteryCity,
                    deliveryDate: order.deliveryDate,
                    floristName,
                    totalPriceCents: order.totalPriceCents,
                    audience: 'aggregator',
                });
                const r = await sendFloremTransactionalMail({
                    to: aggregatorTo,
                    subject: `[AF/Provider] Ordine ${order.orderNumber} — trasparenza B2B`,
                    html,
                });
                return { channel: 'email_aggregator', ok: r.ok, error: r.error };
            } catch (e) {
                return {
                    channel: 'email_aggregator',
                    ok: false,
                    error: e instanceof Error ? e.message : String(e),
                };
            }
        })()
    );

    // 6) Email agenzia funebre
    tasks.push(
        (async (): Promise<PartnerOrderNotificationResult> => {
            if (!agencyTo) {
                return { channel: 'email_agency', ok: true, skipped: 'no_agency_email' };
            }
            try {
                const html = buildAgencyTransparencyHtml({
                    orderNumber: order.orderNumber,
                    agencyName: order.agencyName || agency?.shopName || null,
                    partnershipChannel: order.partnershipChannel || agency?.partnershipChannel || null,
                    deceasedName: order.deceasedName,
                    cemeteryName: order.cemeteryName,
                    cemeteryCity: order.cemeteryCity,
                    deliveryDate: order.deliveryDate,
                    floristName,
                    totalPriceCents: order.totalPriceCents,
                    audience: 'agency',
                });
                const r = await sendFloremTransactionalMail({
                    to: agencyTo,
                    subject: `FloreMoria — ordine ${order.orderNumber} in consegna`,
                    html,
                });
                return { channel: 'email_agency', ok: r.ok, error: r.error };
            } catch (e) {
                return {
                    channel: 'email_agency',
                    ok: false,
                    error: e instanceof Error ? e.message : String(e),
                };
            }
        })()
    );

    const results = await Promise.all(tasks);
    console.info('[partner-order-notifications]', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        results: results.map((r) => ({ channel: r.channel, ok: r.ok, skipped: r.skipped, error: r.error })),
    });
    return results;
}
