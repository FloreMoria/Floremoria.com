/**
 * Alert: bonifici a fioristi senza fattura ricevuta entro 15 giorni.
 * Cross-match automatico ordine ↔ bonifico (data, fiorista, defunto, cimitero, importo).
 */

import prisma from '@/lib/prisma';
import { sendFloremTransactionalMail } from '@/lib/serverMail';
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/metaCloudApiClient';

export type FloristMissingInvoiceRow = {
    id: string;
    partnerId: string | null;
    partnerName: string;
    partnerVat: string | null;
    partnerEmail: string | null;
    partnerWhatsapp: string | null;
    paymentDate: string;
    amountCents: number;
    daysSincePayment: number;
    bankLineId: string | null;
    documentId: string | null;
    orderId: string | null;
    orderNumber: string | null;
    /** manual = Associa ordine; auto = matching incrociato; null = non associato */
    orderMatchSource: 'manual' | 'auto' | null;
    description: string;
    severity: 'warning' | 'critical';
    statusLabel: string;
};

function normalizeName(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

function namesCompatible(a: string, b: string): boolean {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return false;
    if (na.includes(nb) || nb.includes(na)) return true;
    const tokens = na.split(' ').filter((t) => t.length > 3);
    return tokens.some((t) => nb.includes(t));
}

function textContainsName(haystack: string, needle: string): boolean {
    const h = normalizeName(haystack);
    const n = normalizeName(needle);
    if (!h || !n || n.length < 3) return false;
    if (h.includes(n)) return true;
    const parts = n.split(' ').filter((p) => p.length >= 3);
    if (parts.length >= 2) {
        return parts.filter((p) => h.includes(p)).length >= Math.min(2, parts.length);
    }
    return parts.some((p) => h.includes(p));
}

function daysBetween(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

type InvoiceCandidate = {
    vendorName: string;
    totalCents: number;
    expenseDate: Date;
    vendorVat: string | null;
};

type OrderMatchCandidate = {
    id: string;
    orderNumber: string | null;
    partnerId: string | null;
    deceasedName: string;
    cemeteryName: string;
    cemeteryCity: string;
    floristCompensationCents: number | null;
    totalPriceCents: number;
    createdAt: Date;
    updatedAt: Date;
    deliveryDate: Date | null;
    partnerShopName: string | null;
    partnerOwnerName: string | null;
};

/**
 * Punteggio matching bonifico ↔ ordine: date, fiorista, defunto, cimitero, importo.
 * Soglia minima 45; preferisce match forte su importo+partner.
 */
function scoreOrderAgainstBankLine(
    order: OrderMatchCandidate,
    opts: {
        description: string;
        amountCents: number;
        paymentDate: Date;
        partnerId: string | null;
        partnerName: string;
    }
): number {
    let score = 0;
    const desc = opts.description || '';

    if (opts.partnerId && order.partnerId === opts.partnerId) score += 35;
    else if (
        order.partnerShopName &&
        namesCompatible(opts.partnerName, order.partnerShopName)
    ) {
        score += 22;
    } else if (
        order.partnerOwnerName &&
        namesCompatible(opts.partnerName, order.partnerOwnerName)
    ) {
        score += 18;
    } else if (order.partnerShopName && textContainsName(desc, order.partnerShopName)) {
        score += 15;
    }

    const comp = order.floristCompensationCents || 0;
    if (comp > 0 && Math.abs(comp - opts.amountCents) <= 50) score += 40;
    else if (comp > 0 && Math.abs(comp - opts.amountCents) <= 200) score += 22;
    else if (Math.abs(order.totalPriceCents - opts.amountCents) <= 50) score += 12;

    const anchors = [order.updatedAt, order.createdAt, order.deliveryDate].filter(
        (d): d is Date => Boolean(d)
    );
    let bestDayDelta = Infinity;
    for (const d of anchors) {
        bestDayDelta = Math.min(bestDayDelta, Math.abs(daysBetween(d, opts.paymentDate)));
    }
    if (bestDayDelta <= 3) score += 20;
    else if (bestDayDelta <= 10) score += 12;
    else if (bestDayDelta <= 21) score += 5;
    else if (bestDayDelta > 45) score -= 15;

    if (order.deceasedName && textContainsName(desc, order.deceasedName)) score += 25;
    if (order.cemeteryName && textContainsName(desc, order.cemeteryName)) score += 15;
    if (order.cemeteryCity && textContainsName(desc, order.cemeteryCity)) score += 10;

    if (order.orderNumber && desc.toUpperCase().includes(order.orderNumber.toUpperCase())) {
        score += 40;
    }

    return score;
}

function hasMatchingInvoice(
    invoices: InvoiceCandidate[],
    opts: {
        partnerName: string;
        partnerVat: string | null;
        amountCents: number;
        paymentDate: Date;
    }
): boolean {
    const from = new Date(opts.paymentDate.getTime() - 5 * 24 * 60 * 60 * 1000);
    const to = new Date(opts.paymentDate.getTime() + 15 * 24 * 60 * 60 * 1000);
    const abs = Math.abs(opts.amountCents);
    const vatDigits = (opts.partnerVat || '').replace(/\D/g, '');

    return invoices.some((inv) => {
        if (inv.expenseDate < from || inv.expenseDate > to) return false;
        if (Math.abs(inv.totalCents - abs) > 100) return false;
        const invVat = (inv.vendorVat || '').replace(/\D/g, '');
        if (
            vatDigits.length >= 8 &&
            invVat &&
            (invVat.includes(vatDigits) || vatDigits.includes(invVat))
        ) {
            return true;
        }
        if (namesCompatible(opts.partnerName, inv.vendorName)) return true;
        return false;
    });
}

/**
 * Elenco bonifici fiorista senza fattura entro 15gg dal pagamento.
 */
export async function listFloristMissingInvoices(): Promise<FloristMissingInvoiceRow[]> {
    const now = new Date();
    const lookback = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
    const invoiceLookback = new Date(lookback.getTime() - 20 * 24 * 60 * 60 * 1000);
    const rows: FloristMissingInvoiceRow[] = [];
    const seen = new Set<string>();

    const [partners, invoiceRows, candidateOrders] = await Promise.all([
        prisma.partner.findMany({
            where: { deletedAt: null, isActive: true },
            select: {
                id: true,
                shopName: true,
                ownerName: true,
                vatNumber: true,
                taxCode: true,
                email: true,
                whatsappNumber: true,
            },
            take: 500,
        }),
        prisma.manualFinanceExpense.findMany({
            where: {
                docType: 'FATTURA',
                expenseDate: { gte: invoiceLookback },
            },
            select: {
                vendorName: true,
                totalCents: true,
                expenseDate: true,
                metadataJson: true,
            },
            take: 2000,
        }),
        prisma.order.findMany({
            where: {
                isTest: false,
                deletedAt: null,
                createdAt: { gte: new Date(lookback.getTime() - 60 * 24 * 60 * 60 * 1000) },
            },
            select: {
                id: true,
                orderNumber: true,
                partnerId: true,
                deceasedName: true,
                cemeteryName: true,
                cemeteryCity: true,
                floristCompensationCents: true,
                totalPriceCents: true,
                createdAt: true,
                updatedAt: true,
                deliveryDate: true,
                partner: {
                    select: { shopName: true, ownerName: true },
                },
            },
            take: 1500,
            orderBy: { updatedAt: 'desc' },
        }),
    ]);

    const orderPool: OrderMatchCandidate[] = candidateOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        partnerId: o.partnerId,
        deceasedName: o.deceasedName,
        cemeteryName: o.cemeteryName,
        cemeteryCity: o.cemeteryCity,
        floristCompensationCents: o.floristCompensationCents,
        totalPriceCents: o.totalPriceCents,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        deliveryDate: o.deliveryDate,
        partnerShopName: o.partner?.shopName || null,
        partnerOwnerName: o.partner?.ownerName || null,
    }));

    const invoices: InvoiceCandidate[] = invoiceRows.map((inv) => {
        const meta = inv.metadataJson as { vendorVat?: string | null } | null;
        return {
            vendorName: inv.vendorName,
            totalCents: inv.totalCents,
            expenseDate: inv.expenseDate,
            vendorVat: meta?.vendorVat || null,
        };
    });

    const bankLines = await prisma.bankStatementLine.findMany({
        where: {
            amountCents: { lt: 0 },
            OR: [
                { matchType: 'FLORIST_TRANSFER' },
                { accountingDate: { gte: lookback } },
                { valueDate: { gte: lookback } },
            ],
        },
        orderBy: { accountingDate: 'desc' },
        take: 400,
    });

    for (const line of bankLines) {
        const payDate = line.accountingDate || line.valueDate;
        if (!payDate || payDate < lookback) continue;

        const partner =
            partners.find(
                (p) =>
                    namesCompatible(p.shopName, line.description) ||
                    namesCompatible(p.ownerName, line.description)
            ) || null;

        if (!partner && line.matchType !== 'FLORIST_TRANSFER') continue;

        const partnerName = partner?.shopName || partner?.ownerName || 'Fiorista (da causale)';
        const partnerVat = partner?.vatNumber || partner?.taxCode || null;
        const amountCents = Math.abs(line.amountCents);
        const days = daysBetween(payDate, now);
        if (days < 1) continue;

        if (
            hasMatchingInvoice(invoices, {
                partnerName,
                partnerVat,
                amountCents,
                paymentDate: payDate,
            })
        ) {
            continue;
        }

        const key = `${partner?.id || 'x'}|${payDate.toISOString().slice(0, 10)}|${amountCents}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let orderId = line.matchedOrderId;
        let orderNumber: string | null = null;
        let orderMatchSource: 'manual' | 'auto' | null = orderId ? 'manual' : null;

        if (!orderId) {
            let best: { order: OrderMatchCandidate; score: number } | null = null;
            for (const o of orderPool) {
                const score = scoreOrderAgainstBankLine(o, {
                    description: line.description,
                    amountCents,
                    paymentDate: payDate,
                    partnerId: partner?.id || null,
                    partnerName,
                });
                if (score < 45) continue;
                if (!best || score > best.score) best = { order: o, score };
            }
            if (best) {
                orderId = best.order.id;
                orderNumber = best.order.orderNumber;
                orderMatchSource = 'auto';
            }
        }

        const severity = days >= 15 ? 'critical' : 'warning';
        rows.push({
            id: `bank-${line.id}`,
            partnerId: partner?.id || null,
            partnerName,
            partnerVat,
            partnerEmail: partner?.email || null,
            partnerWhatsapp: partner?.whatsappNumber || null,
            paymentDate: payDate.toISOString().slice(0, 10),
            amountCents,
            daysSincePayment: days,
            bankLineId: line.id,
            documentId: line.documentId,
            orderId,
            orderNumber,
            orderMatchSource,
            description: line.description,
            severity,
            statusLabel: `In attesa fattura da ${days} giorni`,
        });
    }

    const paidOrders = await prisma.order.findMany({
        where: {
            isTest: false,
            deletedAt: null,
            partnerId: { not: null },
            OR: [
                { partnerPaymentStatus: 'PAID' },
                { floristSettlementStatus: { in: ['BONIFICATO', 'RICEVUTA'] } },
            ],
            updatedAt: { gte: lookback },
            floristCompensationCents: { not: null },
        },
        select: {
            id: true,
            orderNumber: true,
            floristCompensationCents: true,
            partnerPaymentStatus: true,
            floristSettlementStatus: true,
            updatedAt: true,
            partner: {
                select: {
                    id: true,
                    shopName: true,
                    ownerName: true,
                    vatNumber: true,
                    taxCode: true,
                    email: true,
                    whatsappNumber: true,
                },
            },
        },
        take: 250,
        orderBy: { updatedAt: 'desc' },
    });

    for (const order of paidOrders) {
        if (order.floristSettlementStatus === 'RICEVUTA') continue;
        const partner = order.partner;
        if (!partner) continue;
        const amountCents = order.floristCompensationCents || 0;
        if (amountCents <= 0) continue;
        const payDate = order.updatedAt;
        const days = daysBetween(payDate, now);
        if (days < 1) continue;

        if (
            hasMatchingInvoice(invoices, {
                partnerName: partner.shopName,
                partnerVat: partner.vatNumber || partner.taxCode,
                amountCents,
                paymentDate: payDate,
            })
        ) {
            continue;
        }

        const key = `${partner.id}|${payDate.toISOString().slice(0, 10)}|${amountCents}|${order.id}`;
        if (seen.has(key)) continue;
        const bankKey = `${partner.id}|${payDate.toISOString().slice(0, 10)}|${amountCents}`;
        if (seen.has(bankKey)) continue;
        seen.add(key);

        const severity = days >= 15 ? 'critical' : 'warning';
        rows.push({
            id: `order-${order.id}`,
            partnerId: partner.id,
            partnerName: partner.shopName,
            partnerVat: partner.vatNumber || partner.taxCode || null,
            partnerEmail: partner.email || null,
            partnerWhatsapp: partner.whatsappNumber || null,
            paymentDate: payDate.toISOString().slice(0, 10),
            amountCents,
            daysSincePayment: days,
            bankLineId: null,
            documentId: null,
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderMatchSource: 'manual',
            description: `Compenso ordine ${order.orderNumber || order.id.slice(0, 8)}`,
            severity,
            statusLabel: `In attesa fattura da ${days} giorni`,
        });
    }

    const orderIds = [...new Set(rows.map((r) => r.orderId).filter(Boolean))] as string[];
    if (orderIds.length) {
        const orders = await prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
        });
        const byId = new Map(orders.map((o) => [o.id, o.orderNumber]));
        for (const r of rows) {
            if (r.orderId && !r.orderNumber) r.orderNumber = byId.get(r.orderId) || null;
        }
    }

    rows.sort((a, b) => b.daysSincePayment - a.daysSincePayment);
    return rows;
}

export async function sendFloristInvoiceReminder(input: {
    rowId: string;
    channel: 'email' | 'whatsapp' | 'both';
    partnerId?: string | null;
    partnerEmail?: string | null;
    partnerWhatsapp?: string | null;
    partnerName: string;
    amountCents: number;
    paymentDate: string;
    daysSincePayment: number;
    orderNumber?: string | null;
}): Promise<{ ok: boolean; sent: string[]; error?: string }> {
    const euro = (input.amountCents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const subject = `FloreMoria — sollecito fattura compenso ${euro} €`;
    const bodyText =
        `Buongiorno ${input.partnerName},\n\n` +
        `risulta un bonifico/compenso di ${euro} € del ${input.paymentDate} ` +
        `(${input.daysSincePayment} giorni fa)` +
        (input.orderNumber ? ` relativo all'ordine ${input.orderNumber}` : '') +
        ` per il quale non abbiamo ancora ricevuto la fattura elettronica.\n\n` +
        `Ti chiediamo cortesemente di emettere e trasmettere la fattura al più presto ` +
        `(Codice SDI K0ROACV — FloreMoria S.r.l.).\n\n` +
        `Grazie,\nFloreMoria Contabilità\n`;

    const sent: string[] = [];
    const errors: string[] = [];

    if (input.channel === 'email' || input.channel === 'both') {
        const to = input.partnerEmail?.trim();
        if (!to) {
            errors.push('Email fiorista assente');
        } else {
            const mail = await sendFloremTransactionalMail({
                to,
                subject,
                text: bodyText,
                html: `<p>${bodyText.replace(/\n/g, '<br/>')}</p>`,
            });
            if (mail.ok) sent.push('email');
            else errors.push(`email: ${mail.error || 'fallita'}`);
        }
    }

    if (input.channel === 'whatsapp' || input.channel === 'both') {
        const phone = input.partnerWhatsapp?.trim();
        if (!phone) {
            errors.push('WhatsApp fiorista assente');
        } else {
            const wa = await sendWhatsAppTextMessage(phone, bodyText.slice(0, 900));
            if (wa.ok) sent.push('whatsapp');
            else errors.push(`whatsapp: ${wa.error || 'fallito'}`);
        }
    }

    if (!sent.length) {
        return { ok: false, sent, error: errors.join(' | ') || 'Nessun canale disponibile' };
    }
    return { ok: true, sent, error: errors.length ? errors.join(' | ') : undefined };
}
