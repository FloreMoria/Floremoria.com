/**
 * Riconciliazione automatica movimenti estratto Fineco.
 * Perché: i payout Stripe/PayPal sono cumulativi; oneri bancari e bonifici fioristi
 * vanno chiusi senza intervento manuale quando la causale è affidabile.
 *
 * Assumption: StripeFinanceMovement sincronizzato; compensi fiorista su Order.floristCompensationCents.
 */

import prisma from '@/lib/prisma';
import { getLedger, addAccountingEntries, addTransaction } from '@/lib/financial/ledgerStore';
import { LEDGER_BANK_ACCOUNT } from '@/lib/financial/companyBankDetails';
import type {
    AccountingEntry,
    BankTransaction,
    ReconciliationResult,
} from '@/lib/financial/types';
import type { ParsedBankMovement, StatementMatchResult } from '@/lib/financial/bankStatements/types';
import {
    matchManualExpenseByAmount,
    markManualExpenseReconciled,
} from '@/lib/financial/manualExpenses';
import {
    suggestBankCategoryFromDescription,
} from '@/lib/financial/bankCategoryOptions';

const ORDER_CODE_RE = /PT-[A-Z]{2}-\d{2}-\d{3,4}/gi;
const BANK_FEE_RE =
    /(imposta\s+(di\s+)?bollo|canone(\s+mensile|\s+annuale)?(\s+conto)?|spese\s+(di\s+)?tenuta|commissioni|competenze(\s+e\s+spese)?|ritenute\s+fiscali|\bf24\b|agenzia\s+delle\s+entrate)/i;
const STRIPE_HINT_RE = /\b(stripe|transfer)\b/i;
const PAYPAL_HINT_RE = /\bpaypal\b/i;
const INTERNAL_TRANSFER_RE =
    /\b(giroconto|prelievo|versamento\s+soci|finanziamento(\s+soci)?|apporto\s+soci|movimento\s+interno|trasferimento\s+interno)\b/i;
const ANTICIPO_RE = /\banticipo\b/i;

/** matchType fiorista: anticipo vs fattura in base alla causale. */
function floristMatchTypeFromDescription(description: string): 'FLORIST_ADVANCE' | 'FLORIST_INVOICE' {
    return ANTICIPO_RE.test(description) ? 'FLORIST_ADVANCE' : 'FLORIST_INVOICE';
}

function dayMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const t = Date.parse(String(iso).slice(0, 10));
    return Number.isFinite(t) ? t : null;
}

function withinDays(a: string | null, b: string | null | undefined, days: number): boolean {
    const da = dayMs(a);
    const db = dayMs(b || null);
    // Vincolo obbligatorio: senza data non si abbina solo sull'importo.
    if (da == null || db == null) return false;
    return Math.abs(da - db) <= days * 24 * 60 * 60 * 1000;
}

function textScore(a: string, b: string): number {
    const na = a.toUpperCase();
    const nb = b.toUpperCase();
    if (!na || !nb) return 0;
    if (na.includes(nb) || nb.includes(na)) return 40;
    const tokens = nb.split(/[^A-Z0-9]+/).filter((t) => t.length > 3);
    let hits = 0;
    for (const t of tokens.slice(0, 8)) {
        if (na.includes(t)) hits += 1;
    }
    return Math.min(35, hits * 8);
}

function normalizeName(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

function movementDateIso(m: ParsedBankMovement): string | null {
    return m.accountingDate || m.valueDate;
}

function matched(
    partial: Omit<StatementMatchResult, 'matchStatus'> & { matchStatus?: StatementMatchResult['matchStatus'] }
): StatementMatchResult {
    return {
        matchStatus: partial.matchStatus || 'MATCHED',
        matchType: partial.matchType,
        matchScore: partial.matchScore,
        matchedTxId: partial.matchedTxId,
        matchedOrderId: partial.matchedOrderId,
        matchNotes: partial.matchNotes,
    };
}

/**
 * Oneri ricorrenti / fiscali → riconciliati e scritti in uscite CE.
 */
export async function matchBankFeeOrTax(movement: ParsedBankMovement): Promise<StatementMatchResult | null> {
    if (movement.amountCents >= 0) return null;
    if (!BANK_FEE_RE.test(movement.description)) return null;

    const abs = Math.abs(movement.amountCents);
    const date = movementDateIso(movement) || new Date().toISOString().slice(0, 10);
    const desc = movement.description.trim();
    const u = desc.toUpperCase();

    let dareAccount = '70900 - Spese di Gestione / Bancarie';
    let label = 'Spesa di Gestione / Bancaria';
    if (/\bF24\b|AGENZIA DELLE ENTRATE|IMU|IVA|RITENUTE/i.test(u)) {
        dareAccount = '70800 - Imposte e Oneri Fiscali';
        label = 'Spesa Fiscale';
    } else if (/IMPOSTA DI BOLLO|CANONE|SPESE.*TENUTA|COMPETENZE/i.test(u)) {
        dareAccount = '70900 - Spese di Gestione / Bancarie';
        label = 'Spesa di Gestione / Bancaria';
    } else if (/COMMISSIONI/i.test(u)) {
        dareAccount = '70200 - Commissioni Gateway / Banca';
        label = 'Commissioni';
    }

    const entryId = `entry_bankfee_${date}_${abs}_${desc.slice(0, 24).replace(/\W+/g, '_')}`;
    // Authority contabile = BANK_LINE (estratto Fineco). Non dual-write JSON_ENTRY:
    // crea doppioni CE con stesso giorno/importo già sanati in ledgerDoubleEntrySanitize.
    const entry: AccountingEntry = {
        id: entryId,
        date,
        description: `${label}: ${desc.slice(0, 160)}`,
        dareAccount,
        avereAccount: LEDGER_BANK_ACCOUNT,
        amountCents: abs,
        vatAmountCents: 0,
        isForeignService: false,
        invoiceReference: `BANK-FEE-${date.replace(/-/g, '')}`,
        status: 'CONFIRMED',
    };
    // Solo cache locale ephemeral se manca ancora la riga Neon BANK_LINE
    try {
        const prisma = (await import('@/lib/prisma')).default;
        const bankHit = await prisma.financialLedgerEntry.findFirst({
            where: {
                sourceType: 'BANK_LINE',
                reversedAt: null,
                totalCents: -abs,
                accountingDate: {
                    gte: new Date(`${date}T00:00:00.000Z`),
                    lt: new Date(`${date}T23:59:59.999Z`),
                },
            },
            select: { id: true },
        });
        if (!bankHit) {
            addAccountingEntries([entry]);
        }
    } catch {
        addAccountingEntries([entry]);
    }

    const txId = `fineco_fee_${date}_${abs}`;
    addTransaction({
        id: txId,
        amountCents: movement.amountCents,
        currency: 'EUR',
        side: 'iban',
        status: 'completed',
        reference: desc.slice(0, 120),
        counterpartyName: label,
        counterpartyIban: null,
        emittedAt: `${date}T12:00:00.000Z`,
        category: 'BANK_FEE',
        rawData: { source: 'fineco-auto', description: desc },
    });

    return matched({
        matchType: 'BANK_FEE',
        matchScore: 100,
        matchedTxId: txId,
        matchedOrderId: null,
        matchNotes: `Riconciliato — ${label} (uscita CE automatica)`,
    });
}

/**
 * Payout cumulativo Stripe/PayPal: abbina il versamento bancario al gruppo movimenti/ordini del payout.
 */
export async function matchCumulativePayout(
    movement: ParsedBankMovement
): Promise<StatementMatchResult | null> {
    if (movement.amountCents <= 0) return null;
    const desc = movement.description;
    const isStripe = STRIPE_HINT_RE.test(desc);
    const isPaypal = PAYPAL_HINT_RE.test(desc);
    if (!isStripe && !isPaypal) return null;

    // Micro-accrediti PayPal (cashback / storni) → non trattarli come payout cumulativo
    if (isPaypal && /\b(cashback|rimborso|refund|storno|rebate|cash\s*back)\b/i.test(desc)) {
        return matched({
            matchType: 'PAYPAL_CASHBACK',
            matchScore: 92,
            matchedTxId: null,
            matchedOrderId: null,
            matchNotes: `Cashback / rimborso PayPal (€${(movement.amountCents / 100).toFixed(2)})`,
        });
    }

    const date = movementDateIso(movement);
    const center = date ? new Date(`${date}T12:00:00.000Z`) : new Date();
    const from = new Date(center.getTime() - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(center.getTime() + 3 * 24 * 60 * 60 * 1000);
    const amount = movement.amountCents;

    // 1) Payout Stripe con importo coerente (ledger Stripe salva payout come negativo)
    const payout = await prisma.stripeFinanceMovement.findFirst({
        where: {
            OR: [
                { type: { equals: 'payout', mode: 'insensitive' } },
                { reportingCategory: 'payout' },
            ],
            AND: [
                {
                    OR: [
                        { amountCents: { in: [amount, -amount] } },
                        { netCents: { in: [amount, -amount] } },
                    ],
                },
                {
                    OR: [
                        { availableOn: { gte: from, lte: to } },
                        { createdAtStripe: { gte: from, lte: to } },
                    ],
                },
            ],
        },
        orderBy: { createdAtStripe: 'desc' },
    });

    if (payout) {
        const payoutKey = payout.payoutId || payout.stripeId;
        const related = await prisma.stripeFinanceMovement.findMany({
            where: {
                OR: [{ payoutId: payoutKey }, { stripeId: payoutKey }],
                orderId: { not: null },
            },
            select: { orderId: true, amountCents: true, netCents: true, type: true },
            take: 200,
        });
        const orderIds = Array.from(
            new Set(related.map((r) => r.orderId).filter((id): id is string => Boolean(id)))
        );

        // Se non ci sono orderId sul payout, cerca charge/payment nello stesso giorno ± payout amount
        let notes = `Partita di giro Stripe payout ${payout.stripeId} (€${(amount / 100).toFixed(2)}) — non ricavo di vendita`;
        if (orderIds.length > 0) {
            notes += ` — gruppo ${orderIds.length} ordini riconciliati`;
        } else {
            const charges = await prisma.stripeFinanceMovement.findMany({
                where: {
                    type: { in: ['charge', 'payment', 'payment_network_cost'] },
                    createdAtStripe: { gte: from, lte: to },
                    orderId: { not: null },
                },
                select: { orderId: true, netCents: true, amountCents: true },
                take: 300,
            });
            // Best-effort: ordini con net che sommano ≈ payout (tolleranza 2%)
            const withOrders = charges.filter((c) => c.orderId);
            const sumNet = withOrders.reduce((s, c) => s + Math.abs(c.netCents || c.amountCents), 0);
            if (withOrders.length > 0 && Math.abs(sumNet - amount) <= Math.max(200, amount * 0.02)) {
                orderIds.push(
                    ...Array.from(new Set(withOrders.map((c) => c.orderId!).filter(Boolean)))
                );
                notes += ` — ${orderIds.length} ordini nel batch temporale (Σ net ≈ payout)`;
            } else {
                notes += ' — versamento cumulativo abbinato al payout (dettaglio ordini non linkato)';
            }
        }

        return matched({
            matchType: 'STRIPE_PAYOUT',
            matchScore: 96,
            matchedTxId: payout.stripeId,
            matchedOrderId: orderIds[0] || payout.orderId,
            matchNotes: notes,
        });
    }

    // 2) PayPal (o Stripe senza riga payout): somma ordini gateway nello stesso intervallo
    if (isPaypal || isStripe) {
        const gatewayFilter = isPaypal
            ? { paymentMethodLabel: { contains: 'paypal', mode: 'insensitive' as const } }
            : {
                  OR: [
                      { paymentMethodLabel: { contains: 'card', mode: 'insensitive' as const } },
                      { paymentMethodLabel: { contains: 'stripe', mode: 'insensitive' as const } },
                      { stripeTransactionId: { not: null } },
                  ],
              };

        const orders = await prisma.order.findMany({
            where: {
                isTest: false,
                deletedAt: null,
                createdAt: { gte: from, lte: to },
                status: { in: ['COMPLETED', 'IN_PROGRESS', 'DELIVERING', 'ACCEPTED'] },
                ...gatewayFilter,
            },
            select: {
                id: true,
                orderNumber: true,
                totalPriceCents: true,
                netAmount: true,
                stripeFee: true,
            },
            take: 400,
            orderBy: { createdAt: 'asc' },
        });

        if (orders.length > 0) {
            // Cerca sottoinsieme greedy: somma net ≈ amount
            const nets = orders.map((o) => ({
                id: o.id,
                orderNumber: o.orderNumber,
                net:
                    o.netAmount != null
                        ? Math.round(o.netAmount * 100)
                        : o.totalPriceCents - Math.round((o.stripeFee || 0) * 100),
            }));

            // Prova somma totale
            const totalNet = nets.reduce((s, n) => s + n.net, 0);
            if (Math.abs(totalNet - amount) <= Math.max(150, amount * 0.03)) {
                return matched({
                    matchType: isPaypal ? 'PAYPAL_PAYOUT' : 'STRIPE_PAYOUT',
                    matchScore: 90,
                    matchedTxId: null,
                    matchedOrderId: nets[0]?.id || null,
                    matchNotes: `Versamento ${isPaypal ? 'PayPal' : 'Stripe'} cumulativo: ${nets.length} ordini (Σ net €${(totalNet / 100).toFixed(2)})`,
                });
            }

            // Greedy pack fino all'importo
            let acc = 0;
            const picked: typeof nets = [];
            for (const n of nets) {
                if (acc + n.net > amount + 150) continue;
                picked.push(n);
                acc += n.net;
                if (Math.abs(acc - amount) <= 150) break;
            }
            if (picked.length > 0 && Math.abs(acc - amount) <= Math.max(150, amount * 0.03)) {
                return matched({
                    matchType: isPaypal ? 'PAYPAL_PAYOUT' : 'STRIPE_PAYOUT',
                    matchScore: 88,
                    matchedTxId: null,
                    matchedOrderId: picked[0].id,
                    matchNotes: `Versamento ${isPaypal ? 'PayPal' : 'Stripe'} cumulativo: ${picked.length} ordini (Σ €${(acc / 100).toFixed(2)})`,
                });
            }
        }
    }

    // 3) Fallback: payout Stripe stesso giorno senza importo esatto (±2€)
    const near = await prisma.stripeFinanceMovement.findFirst({
        where: {
            OR: [
                { type: { equals: 'payout', mode: 'insensitive' } },
                { reportingCategory: 'payout' },
            ],
            createdAtStripe: { gte: from, lte: to },
            amountCents: {
                gte: -(amount + 200),
                lte: -(amount - 200),
            },
        },
        orderBy: { createdAtStripe: 'desc' },
    });
    if (near) {
        return matched({
            matchType: 'STRIPE_PAYOUT',
            matchScore: 82,
            matchedTxId: near.stripeId,
            matchedOrderId: near.orderId,
            matchNotes: `Payout Stripe ${near.stripeId} (match tollerante ±€2)`,
        });
    }

    return null;
}

/**
 * Giroconti / patrimonio / versamenti soci → riconciliati come movimento interno.
 */
export async function matchInternalTransfer(
    movement: ParsedBankMovement
): Promise<StatementMatchResult | null> {
    if (!INTERNAL_TRANSFER_RE.test(movement.description)) return null;
    const abs = Math.abs(movement.amountCents);
    // Non esporre più "Giroconto" in UI: mappa a ricavo / spesa non documentata
    return matched({
        matchType: movement.amountCents >= 0 ? 'OTHER_REVENUE' : 'UNDOCUMENTED_EXPENSE',
        matchScore: 96,
        matchedTxId: null,
        matchedOrderId: null,
        matchNotes: `Movimento patrimoniale interno (€${(abs / 100).toFixed(2)}) — ex giroconto/prelievo/versamento soci`,
    });
}

/**
 * Bonifico in uscita verso fiorista: codice ordine e/o nome partner → compenso maturato.
 */
export async function matchFloristTransfer(
    movement: ParsedBankMovement
): Promise<StatementMatchResult | null> {
    if (movement.amountCents >= 0) return null;
    const abs = Math.abs(movement.amountCents);
    const desc = movement.description;
    const codes = Array.from(desc.matchAll(ORDER_CODE_RE)).map((m) => m[0].toUpperCase());

    for (const orderCode of codes) {
        const order = await prisma.order.findUnique({
            where: { orderNumber: orderCode },
            select: {
                id: true,
                orderNumber: true,
                floristCompensationCents: true,
                totalPriceCents: true,
                grossAmount: true,
                partnerId: true,
                partner: { select: { shopName: true, ownerName: true } },
            },
        });
        if (!order) continue;
        const expected =
            order.floristCompensationCents != null
                ? order.floristCompensationCents
                : Math.round(
                      (order.grossAmount != null
                          ? Math.round(order.grossAmount * 100)
                          : order.totalPriceCents) * 0.65
                  );
        const amountOk = Math.abs(expected - abs) <= 100;
        const floristType = floristMatchTypeFromDescription(desc);
        return matched({
            matchStatus: amountOk ? 'MATCHED' : 'PARTIAL',
            matchType: floristType,
            matchScore: amountOk ? 97 : 75,
            matchedTxId: null,
            matchedOrderId: order.id,
            matchNotes: amountOk
                ? `Bonifico fiorista ordine ${order.orderNumber} (compenso €${(expected / 100).toFixed(2)})`
                : `Ordine ${order.orderNumber} in causale; importo €${(abs / 100).toFixed(2)} ≠ compenso atteso €${(expected / 100).toFixed(2)}`,
        });
    }

    // Match per nome fiorista (shop / owner) + importo ≈ compenso PENDING/PAID recente
    const partners = await prisma.partner.findMany({
        where: { deletedAt: null, isActive: true, isB2B: false },
        select: { id: true, shopName: true, ownerName: true },
        take: 400,
    });
    const descNorm = normalizeName(desc);
    const partnerHit = partners.find((p) => {
        const shop = normalizeName(p.shopName || '');
        const owner = normalizeName(p.ownerName || '');
        if (shop.length > 3 && descNorm.includes(shop)) return true;
        if (owner.length > 3 && descNorm.includes(owner)) return true;
        // Cognome / token singoli (anche senza prefisso PT-)
        const ownerTokens = owner.split(' ').filter((t) => t.length > 3);
        const shopTokens = shop.split(' ').filter((t) => t.length > 3);
        return [...ownerTokens, ...shopTokens].some((t) => descNorm.includes(t));
    });

    if (partnerHit) {
        const date = movementDateIso(movement);
        const center = date ? new Date(`${date}T12:00:00.000Z`) : new Date();
        const from = new Date(center.getTime() - 45 * 24 * 60 * 60 * 1000);
        const orders = await prisma.order.findMany({
            where: {
                partnerId: partnerHit.id,
                isTest: false,
                deletedAt: null,
                floristCompensationCents: { not: null },
                updatedAt: { gte: from },
            },
            select: {
                id: true,
                orderNumber: true,
                floristCompensationCents: true,
                floristSettlementStatus: true,
            },
            take: 50,
            orderBy: { updatedAt: 'desc' },
        });

        const exact = orders.find((o) => Math.abs((o.floristCompensationCents || 0) - abs) <= 50);
        if (exact) {
            return matched({
                matchType: floristMatchTypeFromDescription(desc),
                matchScore: 93,
                matchedTxId: null,
                matchedOrderId: exact.id,
                matchNotes: `Bonifico a ${partnerHit.shopName} — ordine ${exact.orderNumber} (compenso maturato)`,
            });
        }

        // Somma cumulativa compensi partner ≈ bonifico
        let acc = 0;
        const picked: typeof orders = [];
        for (const o of orders) {
            const c = o.floristCompensationCents || 0;
            if (c <= 0) continue;
            if (acc + c > abs + 100) continue;
            picked.push(o);
            acc += c;
            if (Math.abs(acc - abs) <= 100) break;
        }
        if (picked.length > 0 && Math.abs(acc - abs) <= 100) {
            return matched({
                matchType: floristMatchTypeFromDescription(desc),
                matchScore: 90,
                matchedTxId: null,
                matchedOrderId: picked[0].id,
                matchNotes: `Bonifico a ${partnerHit.shopName} — ${picked.length} ordini (Σ compensi €${(acc / 100).toFixed(2)})`,
            });
        }

        return matched({
            matchStatus: 'PARTIAL',
            matchType: floristMatchTypeFromDescription(desc),
            matchScore: 70,
            matchedTxId: null,
            matchedOrderId: null,
            matchNotes: `Fiorista riconosciuto (${partnerHit.shopName}) ma nessun compenso esatto per €${(abs / 100).toFixed(2)}`,
        });
    }

    // Fallback importo ≈ compenso su ordini PAID recenti — solo con causale fiorista/SEPA
    if (!/FIORIST|BONIFIC|SEPA|COMPENSO|POSA|BEN:|BENEFICIARIO|SCT/i.test(desc)) {
        return null;
    }
    const paid = await prisma.order.findMany({
        where: {
            isTest: false,
            deletedAt: null,
            partnerId: { not: null },
            floristCompensationCents: { not: null },
        },
        select: {
            id: true,
            orderNumber: true,
            floristCompensationCents: true,
            updatedAt: true,
        },
        take: 250,
        orderBy: { updatedAt: 'desc' },
    });
    for (const o of paid) {
        if (
            Math.abs((o.floristCompensationCents || 0) - abs) <= 50 &&
            withinDays(movementDateIso(movement), o.updatedAt.toISOString(), 20)
        ) {
            return matched({
                matchType: floristMatchTypeFromDescription(desc),
                matchScore: 84,
                matchedTxId: null,
                matchedOrderId: o.id,
                matchNotes: `Possibile liquidazione fiorista ordine ${o.orderNumber} (match importo/data/causale)`,
            });
        }
    }

    return null;
}

function matchAgainstLedgerTx(
    movement: ParsedBankMovement,
    tx: BankTransaction
): StatementMatchResult | null {
    if (tx.amountCents !== movement.amountCents) return null;
    if (!withinDays(movementDateIso(movement), tx.emittedAt, 3)) return null;
    const desc = `${tx.reference || ''} ${tx.counterpartyName || ''}`;
    const score = 55 + textScore(movement.description, desc);
    return {
        matchStatus: score >= 70 ? 'MATCHED' : 'PARTIAL',
        matchType: tx.category || (movement.amountCents >= 0 ? 'INFLOW' : 'OUTFLOW'),
        matchScore: Math.min(100, score),
        matchedTxId: tx.id,
        matchedOrderId: null,
        matchNotes: `Abbinato a movimento ledger ${tx.id} (${tx.counterpartyName})`,
    };
}

/**
 * Pipeline completa di riconciliazione per una riga estratto conto.
 */
export async function reconcileBankMovement(
    movement: ParsedBankMovement
): Promise<StatementMatchResult> {
    // 0) Giroconti / patrimonio
    const internalHit = await matchInternalTransfer(movement);
    if (internalHit) return internalHit;

    // 1) Oneri / fiscali ricorrenti
    const feeHit = await matchBankFeeOrTax(movement);
    if (feeHit) return feeHit;

    // 2) Payout cumulativi Stripe / PayPal
    const payoutHit = await matchCumulativePayout(movement);
    if (payoutHit) return payoutHit;

    // 3) Bonifici fioristi
    const floristHit = await matchFloristTransfer(movement);
    if (floristHit && floristHit.matchScore >= 84) return floristHit;

    // 4) Ledger esistente
    const ledger = getLedger();
    let best: StatementMatchResult | null = floristHit;
    for (const tx of ledger.transactions || []) {
        const hit = matchAgainstLedgerTx(movement, tx);
        if (!hit) continue;
        if (!best || hit.matchScore > best.matchScore) best = hit;
    }

    // 5) Fatture SDI / spese manuali (fuzzy P.IVA + fornitore)
    if (movement.amountCents < 0) {
        const manual = await matchManualExpenseByAmount(
            Math.abs(movement.amountCents),
            movementDateIso(movement),
            movement.description
        );
        if (manual) {
            const score = Math.max(88, manual.score || 88);
            if (!best || score > best.matchScore) {
                best = matched({
                    matchType: manual.isForeignAutofattura
                        ? 'FOREIGN_AUTOFATTURA'
                        : 'SDI_INVOICE',
                    matchScore: score,
                    matchedTxId: manual.id,
                    matchedOrderId: null,
                    matchNotes: manual.isForeignAutofattura
                        ? `Abbinato ad autofattura estera ${manual.vendorName}`
                        : `Abbinato a fattura/spesa ${manual.vendorName}`,
                });
                await markManualExpenseReconciled(manual.id, null);
            }
        }
    }

    if (best && best.matchScore >= 70) return best;
    if (best) return best;

    // Hint semantico: SEPA→fiorista, carta/PayPal→SaaS, gateway→incasso/cashback
    const hint = suggestBankCategoryFromDescription(
        movement.amountCents,
        movement.description
    );

    return {
        matchStatus: 'UNMATCHED',
        matchType: hint,
        matchScore: 0,
        matchedTxId: null,
        matchedOrderId: null,
        matchNotes: `Non abbinato — classificazione suggerita: ${hint}. Usa Abbina / Associa.`,
    };
}

export async function reconcileBankMovements(
    movements: ParsedBankMovement[]
): Promise<StatementMatchResult[]> {
    const results: StatementMatchResult[] = [];
    for (const m of movements) {
        results.push(await reconcileBankMovement(m));
    }
    return results;
}

/** Categoria UI da matchType / segno importo. */
export function movementCategoryLabel(
    amountCents: number,
    matchType: string | null | undefined,
    description?: string
): 'Entrata' | 'Uscita' | 'Onere Bancario' {
    if (isBankFeeMatchType(matchType) || (description && BANK_FEE_RE.test(description))) {
        return 'Onere Bancario';
    }
    if (amountCents >= 0) return 'Entrata';
    return 'Uscita';
}

export function isBankFeeMatchType(matchType: string | null | undefined): boolean {
    return matchType === 'BANK_FEE' || matchType === 'TAX_PAYMENT';
}

export type MatchSuggestion = {
    kind: 'SDI_INVOICE' | 'FLORIST_ORDER' | 'INTERNAL' | 'CATEGORY';
    label: string;
    score: number;
    matchType: string;
    matchedTxId?: string | null;
    matchedOrderId?: string | null;
    expenseId?: string | null;
    notes: string;
};

/**
 * Suggerimenti intelligenti per abbinamento manuale (top 3).
 */
export async function suggestMatchesForLine(line: {
    description: string;
    amountCents: number;
    accountingDate: Date | null;
    valueDate: Date | null;
}): Promise<MatchSuggestion[]> {
    const movement: ParsedBankMovement = {
        lineIndex: 0,
        description: line.description,
        amountCents: line.amountCents,
        accountingDate: line.accountingDate?.toISOString().slice(0, 10) || null,
        valueDate: line.valueDate?.toISOString().slice(0, 10) || null,
        debitCents: line.amountCents < 0 ? Math.abs(line.amountCents) : null,
        creditCents: line.amountCents > 0 ? line.amountCents : null,
        balanceCents: null,
    };

    const suggestions: MatchSuggestion[] = [];

    const internal = await matchInternalTransfer(movement);
    if (internal) {
        // Giroconto non è più una categoria UI: mappa a ricavo/uscita generica
        suggestions.push({
            kind: 'INTERNAL',
            label:
                movement.amountCents >= 0
                    ? 'Altro Ricavo / Entrata Diretta (ex giroconto)'
                    : 'Spesa non documentata (ex giroconto)',
            score: internal.matchScore,
            matchType:
                movement.amountCents >= 0 ? 'OTHER_REVENUE' : 'UNDOCUMENTED_EXPENSE',
            notes: internal.matchNotes || 'Movimento interno',
        });
    }

    if (movement.amountCents < 0) {
        const manual = await matchManualExpenseByAmount(
            Math.abs(movement.amountCents),
            movementDateIso(movement),
            movement.description
        );
        if (manual) {
            suggestions.push({
                kind: 'SDI_INVOICE',
                label: `Fattura fornitore — ${manual.vendorName}`,
                score: manual.score,
                matchType: 'SDI_INVOICE',
                matchedTxId: manual.id,
                expenseId: manual.id,
                notes: `Importo compatibile con ${manual.vendorName}`,
            });
        }

        const florist = await matchFloristTransfer(movement);
        if (florist && florist.matchScore >= 60) {
            suggestions.push({
                kind: 'FLORIST_ORDER',
                label: florist.matchNotes || 'Fattura fiorista',
                score: florist.matchScore,
                matchType: florist.matchType || 'FLORIST_INVOICE',
                matchedOrderId: florist.matchedOrderId,
                notes: florist.matchNotes || 'Match fiorista',
            });
        }
    }

    // Categorie rapide allineate al set UI Movimenti bancari
    const cats: MatchSuggestion[] =
        movement.amountCents >= 0
            ? [
                  {
                      kind: 'CATEGORY',
                      label: 'Incasso Stripe (Payout)',
                      score: 40,
                      matchType: 'STRIPE_PAYOUT',
                      notes: 'Riconciliato manualmente — payout Stripe',
                  },
                  {
                      kind: 'CATEGORY',
                      label: 'Incasso PayPal (Payout)',
                      score: 40,
                      matchType: 'PAYPAL_PAYOUT',
                      notes: 'Riconciliato manualmente — payout PayPal',
                  },
                  {
                      kind: 'CATEGORY',
                      label: 'Cashback / Rimborsi PayPal',
                      score: 35,
                      matchType: 'PAYPAL_CASHBACK',
                      notes: 'Riconciliato manualmente — cashback/rimborso PayPal',
                  },
                  {
                      kind: 'CATEGORY',
                      label: 'Altro Ricavo / Entrata Diretta',
                      score: 30,
                      matchType: 'OTHER_REVENUE',
                      notes: 'Riconciliato manualmente — altro ricavo',
                  },
              ]
            : [
                  {
                      kind: 'CATEGORY',
                      label: 'Fattura fiorista',
                      score: 40,
                      matchType: 'FLORIST_INVOICE',
                      notes: 'Riconciliato manualmente — fattura fiorista',
                  },
                  {
                      kind: 'CATEGORY',
                      label: 'Anticipo fiorista',
                      score: 40,
                      matchType: 'FLORIST_ADVANCE',
                      notes: 'Riconciliato manualmente — anticipo fiorista',
                  },
                  {
                      kind: 'CATEGORY',
                      label: 'Fattura fornitore',
                      score: 40,
                      matchType: 'SDI_INVOICE',
                      notes: 'Riconciliato manualmente — fattura fornitore',
                  },
                  {
                      kind: 'CATEGORY',
                      label: 'Canone SaaS',
                      score: 35,
                      matchType: 'SAAS_SUBSCRIPTION',
                      notes: 'Riconciliato manualmente — canone SaaS',
                  },
                  {
                      kind: 'CATEGORY',
                      label: 'Spesa documentata',
                      score: 35,
                      matchType: 'CASH_EXPENSE',
                      notes: 'Riconciliato manualmente — spesa documentata',
                  },
                  {
                      kind: 'CATEGORY',
                      label: 'Oneri bancari',
                      score: 35,
                      matchType: 'BANK_FEE',
                      notes: 'Riconciliato manualmente — oneri bancari',
                  },
                  {
                      kind: 'CATEGORY',
                      label: 'Spesa non documentata',
                      score: 30,
                      matchType: 'UNDOCUMENTED_EXPENSE',
                      notes: 'Riconciliato manualmente — spesa non documentata',
                  },
              ];

    suggestions.sort((a, b) => b.score - a.score);
    const top = suggestions.filter((s) => s.kind !== 'CATEGORY').slice(0, 3);
    return [...top, ...cats];
}

/**
 * Ri-esegue auto-match sulle righe non MATCHED di un documento.
 */
export async function reReconcileBankStatementDocument(documentId: string): Promise<{
    updated: number;
    matched: number;
    stillUnmatched: number;
}> {
    const lines = await prisma.bankStatementLine.findMany({
        where: { documentId, matchStatus: { not: 'MATCHED' } },
        orderBy: { lineIndex: 'asc' },
    });

    let updated = 0;
    let matched = 0;

    for (const line of lines) {
        const movement: ParsedBankMovement = {
            lineIndex: line.lineIndex,
            description: line.description,
            amountCents: line.amountCents,
            accountingDate: line.accountingDate?.toISOString().slice(0, 10) || null,
            valueDate: line.valueDate?.toISOString().slice(0, 10) || null,
            debitCents: line.debitCents,
            creditCents: line.creditCents,
            balanceCents: line.balanceCents,
        };
        const result = await reconcileBankMovement(movement);
        if (result.matchStatus === 'UNMATCHED' && result.matchScore < 70) continue;

        await prisma.bankStatementLine.update({
            where: { id: line.id },
            data: {
                matchStatus: result.matchStatus,
                matchType: result.matchType,
                matchScore: result.matchScore,
                matchedTxId: result.matchedTxId,
                matchedOrderId: result.matchedOrderId,
                matchNotes: result.matchNotes,
            },
        });
        updated += 1;
        if (result.matchStatus === 'MATCHED') matched += 1;
    }

    const [matchedCount, unmatchedCount] = await Promise.all([
        prisma.bankStatementLine.count({ where: { documentId, matchStatus: 'MATCHED' } }),
        prisma.bankStatementLine.count({ where: { documentId, matchStatus: { not: 'MATCHED' } } }),
    ]);
    await prisma.bankStatementDocument.update({
        where: { id: documentId },
        data: {
            matchedCount,
            unmatchedCount,
            status: unmatchedCount === 0 ? 'RECONCILED' : 'PARSED',
        },
    });

    return { updated, matched, stillUnmatched: unmatchedCount };
}

function mapMatchToResultType(
    matchType: string | null | undefined
): ReconciliationResult['type'] {
    const t = (matchType || '').toUpperCase();
    if (t.includes('STRIPE') || t.includes('PAYPAL') || t.includes('GATEWAY')) return 'STRIPE';
    if (t.includes('FLORIST') || t.includes('SDI') || t.includes('SUPPLIER')) return 'B2B_PARTNER';
    if (t.includes('SAAS') || t.includes('FOREIGN')) return 'EXPENSE_SAAS';
    if (t.includes('SEPA') || t.includes('DIRECT')) return 'DIRECT_SEPA';
    return 'UNRECONCILED';
}

/**
 * Adapter webhook / simulate_transaction → motore unico Neon (reconcileBankMovement).
 * Perché: spegne il doppio motore in reconciler.ts evitando scritture ricavo su payout.
 */
export async function reconcileTransaction(
    transaction: BankTransaction
): Promise<ReconciliationResult> {
    const dateIso = String(transaction.emittedAt || '').slice(0, 10) || null;
    const movement: ParsedBankMovement = {
        lineIndex: 0,
        valueDate: dateIso,
        accountingDate: dateIso,
        description: `${transaction.reference || ''} ${transaction.counterpartyName || ''}`.trim(),
        amountCents: transaction.amountCents,
        debitCents: transaction.amountCents < 0 ? Math.abs(transaction.amountCents) : null,
        creditCents: transaction.amountCents >= 0 ? transaction.amountCents : null,
        balanceCents: null,
        raw: (transaction.rawData as Record<string, unknown>) || undefined,
    };

    const match = await reconcileBankMovement(movement);

    // Aggiorna categoria sul ledger JSON (cache) senza creare ricavi su giroconti
    const { updateTransactionCategory } = await import('@/lib/financial/ledgerStore');
    if (match.matchType) {
        updateTransactionCategory(transaction.id, match.matchType);
    }

    return {
        isReconciled: match.matchStatus === 'MATCHED' || match.matchStatus === 'PARTIAL',
        orderId: match.matchedOrderId,
        matchingScore: match.matchScore,
        type: mapMatchToResultType(match.matchType),
        notes: match.matchNotes,
    };
}

/**
 * Ingestione Prima Nota per ordini gestionali già pagati — idempotente via sourceKey JSON_ENTRY.
 */
export async function processManualOrders(): Promise<number> {
    const { scorporaIvaFloreale, VAT_PCT_FLORAL } = await import('@/lib/financial/vat');
    const { upsertAccountingEntries } = await import('@/lib/financial/ledgerStore');
    const { LEDGER_BANK_ACCOUNT } = await import('@/lib/financial/companyBankDetails');
    const { persistJsonAccountingEntry } = await import('@/lib/financial/historicalLedgerSync');

    const manualOrders = await prisma.order.findMany({
        where: {
            isTest: false,
            deletedAt: null,
            status: { in: ['COMPLETED', 'IN_PROGRESS', 'ACCEPTED'] },
        },
        select: {
            id: true,
            orderNumber: true,
            totalPriceCents: true,
            createdAt: true,
        },
        take: 2000,
    });

    let count = 0;
    for (const order of manualOrders) {
        const orderNumber = order.orderNumber || order.id.slice(0, 8);
        const entryId = `entry_manual_gross_${order.id}`;
        const vat = scorporaIvaFloreale(order.totalPriceCents);
        const entry: AccountingEntry = {
            id: entryId,
            date: new Date(order.createdAt).toISOString().split('T')[0],
            description: `Incasso ordine confermato/pagato - Ordine ${orderNumber}`,
            dareAccount: LEDGER_BANK_ACCOUNT,
            avereAccount: '60100 - Ricavi da Vendite',
            amountCents: order.totalPriceCents,
            vatAmountCents: vat.ivaCents,
            isForeignService: false,
            invoiceReference: orderNumber,
            status: 'CONFIRMED',
        };
        upsertAccountingEntries([entry]);
        await persistJsonAccountingEntry({
            id: entry.id,
            date: entry.date,
            description: entry.description,
            dareAccount: entry.dareAccount,
            avereAccount: entry.avereAccount,
            amountCents: entry.amountCents,
            vatAmountCents: entry.vatAmountCents,
            invoiceReference: entry.invoiceReference,
        });
        // Allinea vatRate sul registro permanente (già gestito da persist via scorporo in ORDER sync)
        void VAT_PCT_FLORAL;
        count += 1;
    }
    return count;
}

