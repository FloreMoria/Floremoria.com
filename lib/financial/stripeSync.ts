/**
 * Sync Stripe → DB contabile (multi-account):
 * - COM = floremoria.com (STRIPE_SECRET_KEY)
 * - EU  = floremoria.eu / PSA San Marco (STRIPE_EU_SECRET_KEY)
 *
 * ID univoci: stripe_tx_<id> | stripe_eu_tx_<id> per evitare collisioni tra account.
 */

import Stripe from 'stripe';
import prisma from '@/lib/prisma';
import { scorporaIvaOrdinaria } from '@/lib/financial/vat';

export type StripeAccountCode = 'COM' | 'EU';

export type StripeAccountConfig = {
    code: StripeAccountCode;
    /** Badge UI */
    label: string;
    /** Prefisso ID persistito (stripe_tx_ / stripe_eu_tx_) */
    idPrefix: string;
    secretKey: string;
};

export type StripeSyncResult = {
    ok: boolean;
    movementsUpserted: number;
    payoutsUpserted: number;
    invoicesUpserted: number;
    accountsSynced: Array<{
        code: StripeAccountCode;
        label: string;
        movementsUpserted: number;
        payoutsUpserted: number;
        invoicesUpserted: number;
        errors: string[];
    }>;
    errors: string[];
};

function makeStripeClient(secretKey: string): Stripe {
    return new Stripe(secretKey, { apiVersion: '2023-10-16' as any });
}

/**
 * Elenco account configurati. COM obbligatorio se presente la chiave;
 * EU opzionale (legacy PSA / floremoria.eu).
 */
export function listConfiguredStripeAccounts(): StripeAccountConfig[] {
    const accounts: StripeAccountConfig[] = [];
    const com =
        process.env.STRIPE_SECRET_KEY?.trim() ||
        process.env.STRIPE_COM_SECRET_KEY?.trim() ||
        '';
    if (com) {
        accounts.push({
            code: 'COM',
            label: 'Stripe COM',
            idPrefix: 'stripe_tx_',
            secretKey: com,
        });
    }
    const eu =
        process.env.STRIPE_EU_SECRET_KEY?.trim() ||
        process.env.STRIPE_SECRET_KEY_EU?.trim() ||
        process.env.STRIPE_PSA_SECRET_KEY?.trim() ||
        '';
    if (eu) {
        accounts.push({
            code: 'EU',
            label: 'Stripe EU - PSA',
            idPrefix: 'stripe_eu_tx_',
            secretKey: eu,
        });
    }
    return accounts;
}

export function scopedStripeId(account: StripeAccountConfig, rawId: string): string {
    if (rawId.startsWith(account.idPrefix)) return rawId.slice(0, 128);
    return `${account.idPrefix}${rawId}`.slice(0, 128);
}

function periodKeyForAccount(account: StripeAccountConfig, d: Date): string {
    const base = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    // COM mantiene chiave storica YYYY-MM; EU usa prefisso per unicità.
    return account.code === 'COM' ? base : `eu:${base}`;
}

function monthBoundsUtc(year: number, monthIndex0: number): { start: Date; end: Date } {
    const start = new Date(Date.UTC(year, monthIndex0, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, monthIndex0 + 1, 0, 23, 59, 59));
    return { start, end };
}

function accountMeta(account: StripeAccountConfig, extra?: Record<string, unknown>) {
    return {
        account: account.code,
        accountLabel: account.label,
        ...(extra || {}),
    };
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
                    : (charge.payment_intent as Stripe.PaymentIntent | null)?.metadata
                          ?.orderNumber);
            if (orderNumber) {
                const order = await prisma.order.findFirst({
                    where: { orderNumber, deletedAt: null },
                    select: { id: true },
                });
                return order?.id ?? null;
            }
        }
    } catch {
        /* ignore */
    }
    return null;
}

/** Sincronizza balance transactions per un account. */
export async function syncStripeBalanceMovements(params?: {
    account: StripeAccountConfig;
    createdGte?: Date;
    createdLte?: Date;
    limitPages?: number;
}): Promise<{ upserted: number; errors: string[] }> {
    if (!params?.account) throw new Error('account Stripe obbligatorio');
    const account = params.account;
    const stripe = makeStripeClient(account.secretKey);
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
                const stripeId = scopedStripeId(account, bt.id);
                const meta = accountMeta(account, {
                    rawStripeId: bt.id,
                    fee_details: bt.fee_details as unknown as object[],
                    exchange_rate: bt.exchange_rate,
                });
                await prisma.stripeFinanceMovement.upsert({
                    where: { stripeId },
                    create: {
                        stripeId,
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
                        metadataJson: meta as object,
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
                        metadataJson: meta as object,
                        syncedAt: new Date(),
                    },
                });
                upserted += 1;
            } catch (err) {
                errors.push(
                    `${account.code} bt ${bt.id}: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        }

        if (!list.has_more || list.data.length === 0) break;
        startingAfter = list.data[list.data.length - 1]?.id;
        if (!startingAfter) break;
    }

    return { upserted, errors };
}

/** Sincronizza payout verso banca per un account. */
export async function syncStripePayouts(params?: {
    account: StripeAccountConfig;
    createdGte?: Date;
    limitPages?: number;
}): Promise<{ upserted: number; errors: string[] }> {
    if (!params?.account) throw new Error('account Stripe obbligatorio');
    const account = params.account;
    const stripe = makeStripeClient(account.secretKey);
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
                const stripeId = scopedStripeId(account, po.id);
                const meta = accountMeta(account, {
                    rawStripeId: po.id,
                    method: po.method,
                    destination: typeof po.destination === 'string' ? po.destination : null,
                    statement_descriptor: po.statement_descriptor,
                    bank: 'Fineco (dest. account Stripe)',
                });
                await prisma.stripeFinanceMovement.upsert({
                    where: { stripeId },
                    create: {
                        stripeId,
                        type: 'payout',
                        reportingCategory: 'payout',
                        description: po.description || `Payout ${account.label} → banca (${po.arrival_date})`,
                        amountCents: -Math.abs(po.amount),
                        feeCents: 0,
                        netCents: -Math.abs(po.amount),
                        currency: po.currency,
                        status: po.status,
                        createdAtStripe: new Date(po.created * 1000),
                        availableOn: po.arrival_date ? new Date(po.arrival_date * 1000) : null,
                        payoutId: stripeId,
                        metadataJson: meta as object,
                    },
                    update: {
                        description: po.description || `Payout ${account.label} → banca (${po.arrival_date})`,
                        amountCents: -Math.abs(po.amount),
                        netCents: -Math.abs(po.amount),
                        status: po.status,
                        availableOn: po.arrival_date ? new Date(po.arrival_date * 1000) : null,
                        metadataJson: meta as object,
                        syncedAt: new Date(),
                    },
                });
                upserted += 1;
            } catch (err) {
                errors.push(
                    `${account.code} payout ${po.id}: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        }

        if (!list.has_more || list.data.length === 0) break;
        startingAfter = list.data[list.data.length - 1]?.id;
        if (!startingAfter) break;
    }

    return { upserted, errors };
}

/** Fatture / aggregato fee mensili per account. */
export async function syncStripeServiceInvoices(params?: {
    account: StripeAccountConfig;
    monthsBack?: number;
}): Promise<{ upserted: number; errors: string[] }> {
    if (!params?.account) throw new Error('account Stripe obbligatorio');
    const account = params.account;
    const stripe = makeStripeClient(account.secretKey);
    const errors: string[] = [];
    let upserted = 0;
    const monthsBack = params?.monthsBack ?? 18;

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
                : new Date(
                      Date.UTC(issuedAt.getUTCFullYear(), issuedAt.getUTCMonth() + 1, 0, 23, 59, 59)
                  );
            const key = periodKeyForAccount(account, periodStart);
            const totalFeeCents = Math.abs(inv.total || inv.amount_paid || 0);
            const taxable = scorporaIvaOrdinaria(totalFeeCents);
            const scopedInvoiceId = scopedStripeId(account, inv.id);

            try {
                await prisma.stripeServiceInvoice.upsert({
                    where: { periodKey: key },
                    create: {
                        stripeInvoiceId: scopedInvoiceId,
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
                        metadataJson: accountMeta(account, {
                            rawStripeInvoiceId: inv.id,
                            customer_email: inv.customer_email,
                            billing_reason: inv.billing_reason,
                            source: 'stripe_invoices_api',
                        }) as object,
                    },
                    update: {
                        stripeInvoiceId: scopedInvoiceId,
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
                        metadataJson: accountMeta(account, {
                            rawStripeInvoiceId: inv.id,
                            customer_email: inv.customer_email,
                            billing_reason: inv.billing_reason,
                            source: 'stripe_invoices_api',
                        }) as object,
                    },
                });
                upserted += 1;
            } catch (err) {
                errors.push(
                    `${account.code} invoice ${inv.id}: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        }
    } catch (err) {
        errors.push(
            `${account.code} invoices.list: ${err instanceof Error ? err.message : String(err)}`
        );
    }

    const now = new Date();
    for (let i = 0; i < monthsBack; i++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const { start, end } = monthBoundsUtc(d.getUTCFullYear(), d.getUTCMonth());
        const key = periodKeyForAccount(account, start);

        const existing = await prisma.stripeServiceInvoice.findUnique({ where: { periodKey: key } });
        if (existing?.stripeInvoiceId && existing.invoicePdfUrl) continue;

        const accountScope =
            account.code === 'COM'
                ? {
                      OR: [
                          { stripeId: { startsWith: 'stripe_tx_' } },
                          {
                              AND: [
                                  { NOT: { stripeId: { startsWith: 'stripe_eu_tx_' } } },
                                  { NOT: { stripeId: { startsWith: 'stripe_tx_' } } },
                              ],
                          },
                      ],
                  }
                : { stripeId: { startsWith: account.idPrefix } };

        const feeAgg = await prisma.stripeFinanceMovement.aggregate({
            where: {
                createdAtStripe: { gte: start, lte: end },
                AND: [
                    accountScope,
                    { OR: [{ type: 'stripe_fee' }, { feeCents: { gt: 0 } }] },
                ],
            },
            _sum: { feeCents: true },
        });

        const stripeFeeRows = await prisma.stripeFinanceMovement.aggregate({
            where: {
                createdAtStripe: { gte: start, lte: end },
                AND: [accountScope, { type: 'stripe_fee' }],
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
                    number: `STRIPE-FEE-${account.code}-${key.replace(/^eu:/, '')}`,
                    status: 'aggregated',
                    issuedAt: end,
                    periodStart: start,
                    periodEnd: end,
                    currency: 'eur',
                    totalFeeCents: totalFeeCents || 0,
                    taxableFeeCents: taxable.imponibileCents,
                    vatReverseChargeCents: taxable.ivaCents,
                    vendorName: 'Stripe Payments Europe Ltd',
                    metadataJson: accountMeta(account, {
                        source: 'balance_transactions_aggregate',
                        note: 'Fattura sintetica da fee Stripe; PDF ufficiale da Dashboard se non presente via API.',
                    }) as object,
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
                              number: `STRIPE-FEE-${account.code}-${key.replace(/^eu:/, '')}`,
                              metadataJson: accountMeta(account, {
                                  source: 'balance_transactions_aggregate',
                                  note: 'Fattura sintetica da fee Stripe; PDF ufficiale da Dashboard se non presente via API.',
                              }) as object,
                          }),
                },
            });
            upserted += 1;
        } catch (err) {
            errors.push(
                `${account.code} period ${key}: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }

    return { upserted, errors };
}

/** Orchestrazione sync completa su tutti gli account configurati. */
export async function runStripeFinanceSync(params?: {
    createdGte?: Date;
    limitPages?: number;
}): Promise<StripeSyncResult> {
    const createdGte =
        params?.createdGte || new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const limitPages = params?.limitPages ?? 50;
    const accounts = listConfiguredStripeAccounts();

    if (!accounts.length) {
        return {
            ok: false,
            movementsUpserted: 0,
            payoutsUpserted: 0,
            invoicesUpserted: 0,
            accountsSynced: [],
            errors: [
                'Nessuna chiave Stripe configurata (STRIPE_SECRET_KEY e/o STRIPE_EU_SECRET_KEY).',
            ],
        };
    }

    const errors: string[] = [];
    let movementsUpserted = 0;
    let payoutsUpserted = 0;
    let invoicesUpserted = 0;
    const accountsSynced: StripeSyncResult['accountsSynced'] = [];

    for (const account of accounts) {
        const accErrors: string[] = [];
        let movU = 0;
        let poU = 0;
        let invU = 0;

        try {
            const mov = await syncStripeBalanceMovements({
                account,
                createdGte,
                limitPages,
            });
            movU = mov.upserted;
            accErrors.push(...mov.errors);
        } catch (err) {
            accErrors.push(
                `${account.code} movements: ${err instanceof Error ? err.message : String(err)}`
            );
        }

        try {
            const po = await syncStripePayouts({
                account,
                createdGte,
                limitPages: Math.min(limitPages, 20),
            });
            poU = po.upserted;
            accErrors.push(...po.errors);
        } catch (err) {
            accErrors.push(
                `${account.code} payouts: ${err instanceof Error ? err.message : String(err)}`
            );
        }

        try {
            const inv = await syncStripeServiceInvoices({ account, monthsBack: 24 });
            invU = inv.upserted;
            accErrors.push(...inv.errors);
        } catch (err) {
            accErrors.push(
                `${account.code} invoices: ${err instanceof Error ? err.message : String(err)}`
            );
        }

        movementsUpserted += movU;
        payoutsUpserted += poU;
        invoicesUpserted += invU;
        errors.push(...accErrors);
        accountsSynced.push({
            code: account.code,
            label: account.label,
            movementsUpserted: movU,
            payoutsUpserted: poU,
            invoicesUpserted: invU,
            errors: accErrors,
        });
    }

    try {
        const { syncHistoricalLedgerFromSources } = await import(
            '@/lib/financial/historicalLedgerSync'
        );
        await syncHistoricalLedgerFromSources();
    } catch (err) {
        errors.push(`ledger: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
        await prisma.systemState.upsert({
            where: { key: 'finance.stripe.last_sync' },
            create: {
                key: 'finance.stripe.last_sync',
                value: new Date().toISOString(),
            },
            update: { value: new Date().toISOString() },
        });
        await prisma.systemState.upsert({
            where: { key: 'finance.stripe.accounts' },
            create: {
                key: 'finance.stripe.accounts',
                value: JSON.stringify(
                    accounts.map((a) => ({ code: a.code, label: a.label, configured: true }))
                ),
            },
            update: {
                value: JSON.stringify(
                    accounts.map((a) => ({ code: a.code, label: a.label, configured: true }))
                ),
            },
        });
    } catch {
        /* ignore */
    }

    return {
        ok: errors.length === 0,
        movementsUpserted,
        payoutsUpserted,
        invoicesUpserted,
        accountsSynced,
        errors,
    };
}

/** Helper badge UI da metadata / stripeId. */
export function stripeAccountBadgeFromMovement(m: {
    stripeId?: string | null;
    metadataJson?: unknown;
}): { code: StripeAccountCode; label: string } {
    const meta = (m.metadataJson || {}) as Record<string, unknown>;
    if (meta.account === 'EU' || String(m.stripeId || '').startsWith('stripe_eu_tx_')) {
        return { code: 'EU', label: String(meta.accountLabel || 'Stripe EU - PSA') };
    }
    if (meta.account === 'COM' || String(m.stripeId || '').startsWith('stripe_tx_')) {
        return { code: 'COM', label: String(meta.accountLabel || 'Stripe COM') };
    }
    return { code: 'COM', label: 'Stripe COM' };
}
