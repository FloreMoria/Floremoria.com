/**
 * Sync bidirezionale Stripe → DB contabile:
 * balance_transactions (entrate/uscite/fee), payouts (Fineco), fatture mensili commissioni.
 */

import Stripe from 'stripe';
import prisma from '@/lib/prisma';
import { scorporaIvaOrdinaria } from '@/lib/financial/vat';

export type StripeSyncResult = {
    ok: boolean;
    movementsUpserted: number;
    payoutsUpserted: number;
    invoicesUpserted: number;
    errors: string[];
};

function getStripeClient(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new Error('STRIPE_SECRET_KEY non configurata');
    return new Stripe(key, { apiVersion: '2023-10-16' as any });
}

function periodKeyFromDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function monthBoundsUtc(year: number, monthIndex0: number): { start: Date; end: Date } {
    const start = new Date(Date.UTC(year, monthIndex0, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, monthIndex0 + 1, 0, 23, 59, 59));
    return { start, end };
}

async function resolveOrderIdFromSource(
    stripe: Stripe,
    sourceId: string | null | undefined
): Promise<string | null> {
    if (!sourceId) return null;
    try {
        if (sourceId.startsWith('ch_') || sourceId.startsWith('py_')) {
            const charge = await stripe.charges.retrieve(sourceId);
            const orderNumber =
                charge.metadata?.orderNumber ||
                (typeof charge.payment_intent === 'string'
                    ? undefined
                    : (charge.payment_intent as Stripe.PaymentIntent | null)?.metadata?.orderNumber);
            if (orderNumber) {
                const order = await prisma.order.findFirst({
                    where: { orderNumber, deletedAt: null },
                    select: { id: true },
                });
                return order?.id ?? null;
            }
        }
    } catch {
        /* ignore lookup failures */
    }
    return null;
}

/** Sincronizza balance transactions Stripe nel DB. */
export async function syncStripeBalanceMovements(params?: {
    createdGte?: Date;
    createdLte?: Date;
    limitPages?: number;
}): Promise<{ upserted: number; errors: string[] }> {
    const stripe = getStripeClient();
    const errors: string[] = [];
    let upserted = 0;
    const limitPages = params?.limitPages ?? 8;

    const createdFilter: Stripe.RangeQueryParam = {};
    if (params?.createdGte) createdFilter.gte = Math.floor(params.createdGte.getTime() / 1000);
    if (params?.createdLte) createdFilter.lte = Math.floor(params.createdLte.getTime() / 1000);

    let startingAfter: string | undefined;
    for (let page = 0; page < limitPages; page++) {
        const list = await stripe.balanceTransactions.list({
            limit: 100,
            ...(Object.keys(createdFilter).length ? { created: createdFilter } : {}),
            ...(startingAfter ? { starting_after: startingAfter } : {}),
        });

        for (const bt of list.data) {
            try {
                const sourceId = typeof bt.source === 'string' ? bt.source : bt.source?.id ?? null;
                const orderId = await resolveOrderIdFromSource(stripe, sourceId);
                await prisma.stripeFinanceMovement.upsert({
                    where: { stripeId: bt.id },
                    create: {
                        stripeId: bt.id,
                        type: bt.type,
                        reportingCategory: bt.reporting_category || null,
                        description: bt.description || null,
                        amountCents: bt.amount,
                        feeCents: bt.fee,
                        netCents: bt.net,
                        currency: bt.currency,
                        status: bt.status || null,
                        createdAtStripe: new Date(bt.created * 1000),
                        availableOn: bt.available_on ? new Date(bt.available_on * 1000) : null,
                        sourceId,
                        orderId,
                        metadataJson: {
                            fee_details: bt.fee_details as unknown as object[],
                            exchange_rate: bt.exchange_rate,
                        } as object,
                    },
                    update: {
                        type: bt.type,
                        reportingCategory: bt.reporting_category || null,
                        description: bt.description || null,
                        amountCents: bt.amount,
                        feeCents: bt.fee,
                        netCents: bt.net,
                        currency: bt.currency,
                        status: bt.status || null,
                        availableOn: bt.available_on ? new Date(bt.available_on * 1000) : null,
                        sourceId,
                        orderId: orderId ?? undefined,
                        metadataJson: {
                            fee_details: bt.fee_details as unknown as object[],
                            exchange_rate: bt.exchange_rate,
                        } as object,
                        syncedAt: new Date(),
                    },
                });
                upserted += 1;
            } catch (err) {
                errors.push(`bt ${bt.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        if (!list.has_more || list.data.length === 0) break;
        startingAfter = list.data[list.data.length - 1]?.id;
        if (!startingAfter) break;
    }

    return { upserted, errors };
}

/** Sincronizza payout verso conto bancario (Fineco). */
export async function syncStripePayouts(params?: {
    createdGte?: Date;
    limitPages?: number;
}): Promise<{ upserted: number; errors: string[] }> {
    const stripe = getStripeClient();
    const errors: string[] = [];
    let upserted = 0;
    const limitPages = params?.limitPages ?? 4;

    const createdFilter: Stripe.RangeQueryParam = {};
    if (params?.createdGte) createdFilter.gte = Math.floor(params.createdGte.getTime() / 1000);

    let startingAfter: string | undefined;
    for (let page = 0; page < limitPages; page++) {
        const list = await stripe.payouts.list({
            limit: 100,
            ...(Object.keys(createdFilter).length ? { created: createdFilter } : {}),
            ...(startingAfter ? { starting_after: startingAfter } : {}),
        });

        for (const po of list.data) {
            try {
                // Uscita dal wallet Stripe → banca: amount positivo in payout, segno negativo in ledger.
                await prisma.stripeFinanceMovement.upsert({
                    where: { stripeId: po.id },
                    create: {
                        stripeId: po.id,
                        type: 'payout',
                        reportingCategory: 'payout',
                        description: po.description || `Payout Stripe → banca (${po.arrival_date})`,
                        amountCents: -Math.abs(po.amount),
                        feeCents: 0,
                        netCents: -Math.abs(po.amount),
                        currency: po.currency,
                        status: po.status,
                        createdAtStripe: new Date(po.created * 1000),
                        availableOn: po.arrival_date ? new Date(po.arrival_date * 1000) : null,
                        payoutId: po.id,
                        metadataJson: {
                            method: po.method,
                            destination: typeof po.destination === 'string' ? po.destination : null,
                            statement_descriptor: po.statement_descriptor,
                            bank: 'Fineco (dest. account Stripe)',
                        },
                    },
                    update: {
                        description: po.description || `Payout Stripe → banca (${po.arrival_date})`,
                        amountCents: -Math.abs(po.amount),
                        netCents: -Math.abs(po.amount),
                        status: po.status,
                        availableOn: po.arrival_date ? new Date(po.arrival_date * 1000) : null,
                        metadataJson: {
                            method: po.method,
                            destination: typeof po.destination === 'string' ? po.destination : null,
                            statement_descriptor: po.statement_descriptor,
                            bank: 'Fineco (dest. account Stripe)',
                        },
                        syncedAt: new Date(),
                    },
                });
                upserted += 1;
            } catch (err) {
                errors.push(`payout ${po.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        if (!list.has_more || list.data.length === 0) break;
        startingAfter = list.data[list.data.length - 1]?.id;
        if (!startingAfter) break;
    }

    return { upserted, errors };
}

/**
 * Acquisisce fatture mensili commissioni Stripe.
 * Preferisce invoice Stripe formali; altrimenti aggrega fee da balance_transactions per mese (reverse charge).
 */
export async function syncStripeServiceInvoices(params?: {
    monthsBack?: number;
}): Promise<{ upserted: number; errors: string[] }> {
    const stripe = getStripeClient();
    const errors: string[] = [];
    let upserted = 0;
    const monthsBack = params?.monthsBack ?? 18;

    // 1) Invoice Stripe Billing (se presenti sull'account)
    try {
        const invoices = await stripe.invoices.list({
            limit: 100,
            status: 'paid',
            expand: ['data.charge'],
        });
        for (const inv of invoices.data) {
            const issuedAt = new Date((inv.status_transitions?.paid_at || inv.created) * 1000);
            const periodStart = inv.period_start
                ? new Date(inv.period_start * 1000)
                : new Date(Date.UTC(issuedAt.getUTCFullYear(), issuedAt.getUTCMonth(), 1));
            const periodEnd = inv.period_end
                ? new Date(inv.period_end * 1000)
                : new Date(Date.UTC(issuedAt.getUTCFullYear(), issuedAt.getUTCMonth() + 1, 0, 23, 59, 59));
            const key = periodKeyFromDate(periodStart);
            const totalFeeCents = Math.abs(inv.total || inv.amount_paid || 0);
            const taxable = scorporaIvaOrdinaria(totalFeeCents);

            try {
                await prisma.stripeServiceInvoice.upsert({
                    where: { periodKey: key },
                    create: {
                        stripeInvoiceId: inv.id,
                        periodKey: key,
                        number: inv.number || inv.id,
                        status: inv.status || 'paid',
                        issuedAt,
                        periodStart,
                        periodEnd,
                        currency: inv.currency || 'eur',
                        totalFeeCents,
                        taxableFeeCents: taxable.imponibileCents,
                        vatReverseChargeCents: taxable.ivaCents,
                        vendorName: 'Stripe Payments Europe Ltd',
                        invoicePdfUrl: inv.invoice_pdf || null,
                        hostedInvoiceUrl: inv.hosted_invoice_url || null,
                        metadataJson: {
                            customer_email: inv.customer_email,
                            billing_reason: inv.billing_reason,
                            source: 'stripe_invoices_api',
                        },
                    },
                    update: {
                        stripeInvoiceId: inv.id,
                        number: inv.number || inv.id,
                        status: inv.status || 'paid',
                        issuedAt,
                        periodStart,
                        periodEnd,
                        totalFeeCents,
                        taxableFeeCents: taxable.imponibileCents,
                        vatReverseChargeCents: taxable.ivaCents,
                        invoicePdfUrl: inv.invoice_pdf || null,
                        hostedInvoiceUrl: inv.hosted_invoice_url || null,
                        syncedAt: new Date(),
                        metadataJson: {
                            customer_email: inv.customer_email,
                            billing_reason: inv.billing_reason,
                            source: 'stripe_invoices_api',
                        },
                    },
                });
                upserted += 1;
            } catch (err) {
                errors.push(`invoice ${inv.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    } catch (err) {
        errors.push(`invoices.list: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2) Aggregazione mensile fee da movimenti (sempre, riempie mesi senza invoice formale)
    const now = new Date();
    for (let i = 0; i < monthsBack; i++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const { start, end } = monthBoundsUtc(d.getUTCFullYear(), d.getUTCMonth());
        const key = periodKeyFromDate(start);

        const existing = await prisma.stripeServiceInvoice.findUnique({ where: { periodKey: key } });
        // Non sovrascrivere se già arriva da invoice Stripe formale con PDF.
        if (existing?.stripeInvoiceId && existing.invoicePdfUrl) continue;

        const feeAgg = await prisma.stripeFinanceMovement.aggregate({
            where: {
                createdAtStripe: { gte: start, lte: end },
                OR: [
                    { type: 'stripe_fee' },
                    { feeCents: { gt: 0 } },
                ],
            },
            _sum: { feeCents: true },
        });

        // Fee trattenute sui payment: somma feeCents; type stripe_fee ha amount negativo.
        const stripeFeeRows = await prisma.stripeFinanceMovement.aggregate({
            where: {
                createdAtStripe: { gte: start, lte: end },
                type: 'stripe_fee',
            },
            _sum: { amountCents: true },
        });

        const fromFeeField = Math.abs(feeAgg._sum.feeCents || 0);
        const fromStripeFeeType = Math.abs(stripeFeeRows._sum.amountCents || 0);
        const totalFeeCents = Math.max(fromFeeField, fromStripeFeeType);
        if (totalFeeCents <= 0 && !existing) continue;

        const taxable = scorporaIvaOrdinaria(totalFeeCents || existing?.totalFeeCents || 0);

        try {
            await prisma.stripeServiceInvoice.upsert({
                where: { periodKey: key },
                create: {
                    periodKey: key,
                    number: `STRIPE-FEE-${key}`,
                    status: 'aggregated',
                    issuedAt: end,
                    periodStart: start,
                    periodEnd: end,
                    currency: 'eur',
                    totalFeeCents: totalFeeCents || 0,
                    taxableFeeCents: taxable.imponibileCents,
                    vatReverseChargeCents: taxable.ivaCents,
                    vendorName: 'Stripe Payments Europe Ltd',
                    metadataJson: {
                        source: 'balance_transactions_aggregate',
                        note: 'Fattura sintetica da fee Stripe; PDF ufficiale da Dashboard → Documents se non presente via API.',
                    },
                },
                update: {
                    totalFeeCents: totalFeeCents || existing?.totalFeeCents || 0,
                    taxableFeeCents: taxable.imponibileCents,
                    vatReverseChargeCents: taxable.ivaCents,
                    syncedAt: new Date(),
                    ...(existing?.stripeInvoiceId
                        ? {}
                        : {
                              status: 'aggregated',
                              number: `STRIPE-FEE-${key}`,
                              metadataJson: {
                                  source: 'balance_transactions_aggregate',
                                  note: 'Fattura sintetica da fee Stripe; PDF ufficiale da Dashboard → Documents se non presente via API.',
                              },
                          }),
                },
            });
            upserted += 1;
        } catch (err) {
            errors.push(`period ${key}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    return { upserted, errors };
}

/** Orchestrazione sync completa. */
export async function runStripeFinanceSync(params?: {
    createdGte?: Date;
}): Promise<StripeSyncResult> {
    const createdGte =
        params?.createdGte || new Date(Date.now() - 400 * 24 * 60 * 60 * 1000); // ~13 mesi

    const errors: string[] = [];
    let movementsUpserted = 0;
    let payoutsUpserted = 0;
    let invoicesUpserted = 0;

    try {
        const mov = await syncStripeBalanceMovements({ createdGte });
        movementsUpserted = mov.upserted;
        errors.push(...mov.errors);
    } catch (err) {
        errors.push(`movements: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
        const po = await syncStripePayouts({ createdGte });
        payoutsUpserted = po.upserted;
        errors.push(...po.errors);
    } catch (err) {
        errors.push(`payouts: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
        const inv = await syncStripeServiceInvoices({ monthsBack: 18 });
        invoicesUpserted = inv.upserted;
        errors.push(...inv.errors);
    } catch (err) {
        errors.push(`invoices: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
        ok: errors.length === 0,
        movementsUpserted,
        payoutsUpserted,
        invoicesUpserted,
        errors,
    };
}
