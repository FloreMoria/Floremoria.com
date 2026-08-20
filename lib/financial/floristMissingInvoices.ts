/**
 * Alert: bonifici a fioristi senza fattura ricevuta entro 15 giorni.
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
    orderId: string | null;
    orderNumber: string | null;
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

function daysBetween(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

type InvoiceCandidate = {
    vendorName: string;
    totalCents: number;
    expenseDate: Date;
    vendorVat: string | null;
};

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
        if (vatDigits.length >= 8 && invVat && (invVat.includes(vatDigits) || vatDigits.includes(invVat))) {
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

    const [partners, invoiceRows] = await Promise.all([
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
    ]);

    const invoices: InvoiceCandidate[] = invoiceRows.map((inv) => {
        const meta = inv.metadataJson as { vendorVat?: string | null } | null;
        return {
            vendorName: inv.vendorName,
            totalCents: inv.totalCents,
            expenseDate: inv.expenseDate,
            vendorVat: meta?.vendorVat || null,
        };
    });

    // 1) Uscite estratto conto fiorista
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

        // Solo se fiorista riconosciuto o già classificato FLORIST_TRANSFER
        if (!partner && line.matchType !== 'FLORIST_TRANSFER') continue;

        const partnerName = partner?.shopName || partner?.ownerName || 'Fiorista (da causale)';
        const partnerVat = partner?.vatNumber || partner?.taxCode || null;
        const amountCents = Math.abs(line.amountCents);
        const days = daysBetween(payDate, now);
        if (days < 1) continue; // troppo recente

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
            orderId: line.matchedOrderId,
            orderNumber: null,
            description: line.description,
            severity,
            statusLabel: `In attesa fattura da ${days} giorni`,
        });
    }

    // 2) Ordini con compenso liquidato (PAID / BONIFICATO) senza fattura
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
        if (order.floristSettlementStatus === 'RICEVUTA') continue; // fattura già ricevuta lato workflow
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
        // Evita doppio se già coperto da bank line stesso partner/importo/giorno
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
            orderId: order.id,
            orderNumber: order.orderNumber,
            description: `Compenso ordine ${order.orderNumber || order.id.slice(0, 8)}`,
            severity,
            statusLabel: `In attesa fattura da ${days} giorni`,
        });
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
