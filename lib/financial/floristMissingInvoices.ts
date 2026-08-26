/**
 * Alert: bonifici/compensi fioristi senza fattura entro 15 giorni.
 * Date e "giorni di attesa" sempre da Order (createdAt / deliveryDate) se associato.
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
    /** Data di riferimento UI (ordine se associato, altrimenti bonifico). YYYY-MM-DD */
    paymentDate: string;
    /** Data contabile bonifico (se da bank line). */
    bankPaymentDate: string | null;
    amountCents: number;
    daysSincePayment: number;
    bankLineId: string | null;
    documentId: string | null;
    orderId: string | null;
    orderNumber: string | null;
    orderCreatedAt: string | null;
    orderDeliveryDate: string | null;
    /** manual = bind Contabilità; auto = anagrafica/città/scoring; null = non associato */
    orderMatchSource: 'manual' | 'auto' | null;
    description: string;
    notes: string | null;
    receiptUrl: string | null;
    receiptPath: string | null;
    linkedExpenseId: string | null;
    severity: 'warning' | 'critical';
    statusLabel: string;
};

export type FloristAlertMeta = {
    dismissedAt?: string;
    notes?: string;
    receiptUrl?: string;
    receiptPath?: string;
    linkedExpenseId?: string;
    overrideAmountCents?: number;
    overridePaymentDate?: string;
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
    const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function toDateOnlyIso(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Data di riferimento per attesa fattura: consegna se già avvenuta, altrimenti createdAt.
 * Perché: evita updatedAt (toccato da sync/foto) e date bonifico di altri movimenti.
 */
export { orderReferenceDate } from '@/lib/financial/floristDocStatus';
import { orderReferenceDate } from '@/lib/financial/floristDocStatus';

export function readFloristAlertMeta(raw: unknown): FloristAlertMeta {
    if (!raw || typeof raw !== 'object') return {};
    const root = raw as Record<string, unknown>;
    const alert = root.floristAlert;
    if (!alert || typeof alert !== 'object') return {};
    return alert as FloristAlertMeta;
}

export function mergeFloristAlertMeta(
    raw: unknown,
    patch: Partial<FloristAlertMeta>
): Record<string, unknown> {
    const root =
        raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
    const prev = readFloristAlertMeta(raw);
    root.floristAlert = { ...prev, ...patch };
    return root;
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
    // Ordine creato dopo il bonifico → non può essere il match (es. FF-VI-26-003 vs SDD 04/08).
    if (daysBetween(opts.paymentDate, order.createdAt) > 1) {
        return -999;
    }

    let score = 0;
    const desc = opts.description || '';

    if (opts.partnerId && order.partnerId === opts.partnerId) score += 35;
    else if (order.partnerShopName && namesCompatible(opts.partnerName, order.partnerShopName)) {
        score += 22;
    } else if (order.partnerOwnerName && namesCompatible(opts.partnerName, order.partnerOwnerName)) {
        score += 18;
    } else if (order.partnerShopName && textContainsName(desc, order.partnerShopName)) {
        score += 15;
    }

    const comp = order.floristCompensationCents || 0;
    if (comp > 0 && Math.abs(comp - opts.amountCents) <= 50) score += 40;
    else if (comp > 0 && Math.abs(comp - opts.amountCents) <= 200) score += 22;
    else if (Math.abs(order.totalPriceCents - opts.amountCents) <= 50) score += 12;
    else if (comp > 0 && Math.abs(comp - opts.amountCents) > 500) score -= 40;

    const anchors = [orderReferenceDate(order), order.createdAt, order.deliveryDate].filter(
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

function isLikelyNonFloristBankDescription(description: string): boolean {
    const d = description.toUpperCase();
    return (
        /\bSDD\b/.test(d) ||
        /PAYPAL EUROPE/.test(d) ||
        /ADDEBITO SDD/.test(d) ||
        /STRIPE/.test(d) ||
        /COMMISSIONI/.test(d)
    );
}

/**
 * Ripara associazioni palesemente errate (ordine creato dopo il bonifico / importo distante).
 */
async function repairStaleOrderLinks(
    orderPool: OrderMatchCandidate[]
): Promise<void> {
    const linked = await prisma.bankStatementLine.findMany({
        where: { matchedOrderId: { not: null } },
        select: {
            id: true,
            matchedOrderId: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            description: true,
            matchNotes: true,
        },
        take: 500,
    });
    const byId = new Map(orderPool.map((o) => [o.id, o]));
    const now = new Date();

    for (const line of linked) {
        const order = line.matchedOrderId ? byId.get(line.matchedOrderId) : null;
        if (!order) continue;
        const payDate = line.accountingDate || line.valueDate;
        if (!payDate) continue;
        const amount = Math.abs(line.amountCents);
        const orderCreatedAfterPay = daysBetween(payDate, order.createdAt) > 1;
        const comp = order.floristCompensationCents || 0;
        const amountFar = comp > 0 && Math.abs(comp - amount) > 500;
        const nonFlorist = isLikelyNonFloristBankDescription(line.description);
        if (!(orderCreatedAfterPay || (amountFar && nonFlorist) || (orderCreatedAfterPay && nonFlorist))) {
            continue;
        }
        await prisma.bankStatementLine.update({
            where: { id: line.id },
            data: {
                matchedOrderId: null,
                matchStatus: 'UNMATCHED',
                matchScore: null,
                matchNotes: `Associazione annullata (incongruente con ordine ${order.orderNumber || order.id.slice(0, 8)}; riparato ${toDateOnlyIso(now)})`,
            },
        });
    }
}

/**
 * Elenco bonifici fiorista senza fattura — orizzonte fiscale intero anno corrente.
 */
export async function listFloristMissingInvoices(): Promise<FloristMissingInvoiceRow[]> {
    const now = new Date();
    const year = now.getFullYear();
    const lookback = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const invoiceLookback = lookback;
    const rows: FloristMissingInvoiceRow[] = [];
    const seen = new Set<string>();

    const [partners, invoiceRows, candidateOrders, primaryFloristByDeceased] = await Promise.all([
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
                coverageArea: true,
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
            take: 5000,
        }),
        prisma.order.findMany({
            where: {
                isTest: false,
                deletedAt: null,
                createdAt: { gte: lookback },
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
            take: 5000,
            orderBy: { updatedAt: 'desc' },
        }),
        prisma.partnerDeceasedAssignment.findMany({
            where: { isPrimary: true, partner: { deletedAt: null } },
            select: {
                partnerId: true,
                deceasedProfile: {
                    select: { fullName: true, cemeteryCity: true, cemeteryName: true },
                },
                partner: { select: { id: true, shopName: true, ownerName: true } },
            },
            take: 2000,
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

    await repairStaleOrderLinks(orderPool);

    const anagraficaFloristByNorm = new Map<
        string,
        { partnerId: string; shopName: string; ownerName: string | null }
    >();
    for (const link of primaryFloristByDeceased) {
        const d = link.deceasedProfile;
        if (!d) continue;
        const key = `${normalizeName(d.fullName)}|${normalizeName(d.cemeteryCity)}`;
        anagraficaFloristByNorm.set(key, {
            partnerId: link.partnerId,
            shopName: link.partner.shopName,
            ownerName: link.partner.ownerName,
        });
    }

    function partnerByCoverageCity(city: string): (typeof partners)[number] | null {
        const cityNorm = normalizeName(city);
        if (!cityNorm) return null;
        return (
            partners.find((p) => {
                const cov = normalizeName(p.coverageArea || '');
                if (!cov) return false;
                return cityNorm.includes(cov) || cov.includes(cityNorm.split(' ')[0] || '');
            }) || null
        );
    }

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
                { matchType: { in: ['FLORIST_TRANSFER', 'FLORIST_INVOICE', 'FLORIST_ADVANCE'] } },
                { accountingDate: { gte: lookback } },
                { valueDate: { gte: lookback } },
            ],
        },
        orderBy: { accountingDate: 'desc' },
        take: 3000,
    });

    for (const line of bankLines) {
        const alertMeta = readFloristAlertMeta(line.rawJson);
        if (alertMeta.dismissedAt) continue;

        const bankPayDate = line.accountingDate || line.valueDate;
        if (!bankPayDate || bankPayDate < lookback) continue;

        const floristType =
            line.matchType === 'FLORIST_TRANSFER' ||
            line.matchType === 'FLORIST_INVOICE' ||
            line.matchType === 'FLORIST_ADVANCE';

        // Causali SDD/PayPal/Stripe senza ordine collegato non appartengono a questa coda
        // (anche se matchType è stato classificato FLORIST_* per errore).
        if (isLikelyNonFloristBankDescription(line.description) && !line.matchedOrderId) {
            continue;
        }

        let partner =
            partners.find(
                (p) =>
                    namesCompatible(p.shopName, line.description) ||
                    namesCompatible(p.ownerName || '', line.description)
            ) || null;

        if (!partner && !floristType && !line.matchedOrderId) continue;

        let partnerName = partner?.shopName || partner?.ownerName || 'Fiorista (da causale)';
        let partnerVat = partner?.vatNumber || partner?.taxCode || null;
        let amountCents =
            typeof alertMeta.overrideAmountCents === 'number' && alertMeta.overrideAmountCents > 0
                ? alertMeta.overrideAmountCents
                : Math.abs(line.amountCents);

        let orderId = line.matchedOrderId;
        let orderNumber: string | null = null;
        let linkedOrder: OrderMatchCandidate | null = null;
        const notes = (line.matchNotes || '').toLowerCase();
        const isManualBind = notes.includes('associato da contabilità');
        let orderMatchSource: 'manual' | 'auto' | null = orderId
            ? isManualBind
                ? 'manual'
                : 'auto'
            : null;

        if (orderId) {
            linkedOrder = orderPool.find((o) => o.id === orderId) || null;
            // Se il pool non ha l'ordine (fuori lookback), ricarica
            if (!linkedOrder) {
                const fresh = await prisma.order.findUnique({
                    where: { id: orderId },
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
                        partner: { select: { shopName: true, ownerName: true } },
                    },
                });
                if (fresh) {
                    linkedOrder = {
                        ...fresh,
                        partnerShopName: fresh.partner?.shopName || null,
                        partnerOwnerName: fresh.partner?.ownerName || null,
                    };
                }
            }
            if (linkedOrder) {
                orderNumber = linkedOrder.orderNumber;
                if (linkedOrder.floristCompensationCents && linkedOrder.floristCompensationCents > 0) {
                    amountCents = linkedOrder.floristCompensationCents;
                }
                if (linkedOrder.partnerId) {
                    const orderPartner = partners.find((p) => p.id === linkedOrder!.partnerId);
                    if (orderPartner) {
                        partner = orderPartner;
                        partnerName = orderPartner.shopName || orderPartner.ownerName || partnerName;
                        partnerVat = orderPartner.vatNumber || orderPartner.taxCode || partnerVat;
                    }
                }
            } else {
                // Link orfano → non mostrare ordine
                orderId = null;
                orderMatchSource = null;
            }
        } else if (!isLikelyNonFloristBankDescription(line.description)) {
            let best: { order: OrderMatchCandidate; score: number } | null = null;
            for (const o of orderPool) {
                const anagKey = `${normalizeName(o.deceasedName)}|${normalizeName(o.cemeteryCity)}`;
                const anag = anagraficaFloristByNorm.get(anagKey);
                let score = scoreOrderAgainstBankLine(o, {
                    description: line.description,
                    amountCents,
                    paymentDate: bankPayDate,
                    partnerId: partner?.id || anag?.partnerId || null,
                    partnerName: partnerName || anag?.shopName || '',
                });
                if (anag && (!partner || partner.id === anag.partnerId)) {
                    if (
                        textContainsName(line.description, o.deceasedName) ||
                        textContainsName(line.description, o.cemeteryCity) ||
                        textContainsName(line.description, o.cemeteryName) ||
                        (anag.shopName && textContainsName(line.description, anag.shopName)) ||
                        (anag.ownerName && textContainsName(line.description, anag.ownerName))
                    ) {
                        score += 55;
                    }
                }
                const coveragePartner = partnerByCoverageCity(o.cemeteryCity);
                if (coveragePartner && partner && coveragePartner.id === partner.id) {
                    score += 25;
                }
                if (score < 45) continue;
                if (!best || score > best.score) best = { order: o, score };
            }
            if (best) {
                orderId = best.order.id;
                orderNumber = best.order.orderNumber;
                linkedOrder = best.order;
                orderMatchSource = 'auto';
                if (best.order.floristCompensationCents && best.order.floristCompensationCents > 0) {
                    amountCents = best.order.floristCompensationCents;
                }
                if (best.order.partnerId) {
                    const orderPartner = partners.find((p) => p.id === best!.order.partnerId);
                    if (orderPartner) {
                        partner = orderPartner;
                        partnerName = orderPartner.shopName || orderPartner.ownerName || partnerName;
                        partnerVat = orderPartner.vatNumber || orderPartner.taxCode || partnerVat;
                    }
                }
            }
        }

        // Data / giorni: se ordine collegato → sempre da Order; altrimenti bonifico.
        let refDate = bankPayDate;
        if (alertMeta.overridePaymentDate) {
            const ov = new Date(`${alertMeta.overridePaymentDate}T12:00:00.000Z`);
            if (!Number.isNaN(ov.getTime())) refDate = ov;
        } else if (linkedOrder) {
            refDate = orderReferenceDate(linkedOrder, now);
        }

        const days = Math.max(0, daysBetween(refDate, now));

        if (
            hasMatchingInvoice(invoices, {
                partnerName,
                partnerVat,
                amountCents,
                paymentDate: refDate,
            })
        ) {
            continue;
        }

        const key = `${partner?.id || 'x'}|${toDateOnlyIso(refDate)}|${amountCents}|${line.id}`;
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
            paymentDate: toDateOnlyIso(refDate),
            bankPaymentDate: toDateOnlyIso(bankPayDate),
            amountCents,
            daysSincePayment: days,
            bankLineId: line.id,
            documentId: line.documentId,
            orderId,
            orderNumber,
            orderCreatedAt: linkedOrder ? toDateOnlyIso(linkedOrder.createdAt) : null,
            orderDeliveryDate: linkedOrder?.deliveryDate
                ? toDateOnlyIso(linkedOrder.deliveryDate)
                : null,
            orderMatchSource,
            description: line.description,
            notes: alertMeta.notes || null,
            receiptUrl: alertMeta.receiptUrl || null,
            receiptPath: alertMeta.receiptPath || null,
            linkedExpenseId: alertMeta.linkedExpenseId || null,
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
            createdAt: { gte: lookback },
            floristCompensationCents: { not: null },
        },
        select: {
            id: true,
            orderNumber: true,
            floristCompensationCents: true,
            partnerPaymentStatus: true,
            floristSettlementStatus: true,
            createdAt: true,
            deliveryDate: true,
            veraWorkflowFlags: true,
            financeNotes: true,
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
        orderBy: { createdAt: 'desc' },
    });

    for (const order of paidOrders) {
        if (order.floristSettlementStatus === 'RICEVUTA') continue;
        const flags = (order.veraWorkflowFlags || {}) as Record<string, unknown>;
        if (flags.floristMissingDismissedAt) continue;

        const partner = order.partner;
        if (!partner) continue;
        const amountCents = order.floristCompensationCents || 0;
        if (amountCents <= 0) continue;

        // Evita doppio: già presente via bank line con stesso orderId
        if (rows.some((r) => r.orderId === order.id)) continue;

        const refDate = orderReferenceDate(order, now);
        const days = Math.max(0, daysBetween(refDate, now));

        if (
            hasMatchingInvoice(invoices, {
                partnerName: partner.shopName,
                partnerVat: partner.vatNumber || partner.taxCode,
                amountCents,
                paymentDate: refDate,
            })
        ) {
            continue;
        }

        const key = `${partner.id}|${toDateOnlyIso(refDate)}|${amountCents}|${order.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const severity = days >= 15 ? 'critical' : 'warning';
        rows.push({
            id: `order-${order.id}`,
            partnerId: partner.id,
            partnerName: partner.shopName,
            partnerVat: partner.vatNumber || partner.taxCode || null,
            partnerEmail: partner.email || null,
            partnerWhatsapp: partner.whatsappNumber || null,
            paymentDate: toDateOnlyIso(refDate),
            bankPaymentDate: null,
            amountCents,
            daysSincePayment: days,
            bankLineId: null,
            documentId: null,
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderCreatedAt: toDateOnlyIso(order.createdAt),
            orderDeliveryDate: order.deliveryDate ? toDateOnlyIso(order.deliveryDate) : null,
            orderMatchSource: 'manual',
            description: `Compenso ordine ${order.orderNumber || order.id.slice(0, 8)}`,
            notes: order.financeNotes || null,
            receiptUrl: null,
            receiptPath: null,
            linkedExpenseId:
                typeof flags.floristLinkedExpenseId === 'string' ? flags.floristLinkedExpenseId : null,
            severity,
            statusLabel: `In attesa fattura da ${days} giorni`,
        });
    }

    // Risolvi URL scontrino SOLO da ManualFinanceExpense (Contabilità), mai da Order.photos/GdM.
    const expenseIds = [
        ...new Set(rows.map((r) => r.linkedExpenseId).filter(Boolean)),
    ] as string[];
    if (expenseIds.length) {
        const expenses = await prisma.manualFinanceExpense.findMany({
            where: { id: { in: expenseIds } },
            select: { id: true, blobUrl: true, blobPath: true },
        });
        const byExp = new Map(expenses.map((e) => [e.id, e]));
        for (const r of rows) {
            if (!r.linkedExpenseId) continue;
            const exp = byExp.get(r.linkedExpenseId);
            if (!exp) continue;
            r.receiptUrl = exp.blobUrl || r.receiptUrl;
            r.receiptPath = exp.blobPath || r.receiptPath;
        }
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
