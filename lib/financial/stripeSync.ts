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
    movementsCreated: number;
    movementsUpdated: number;
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
    /** ISO from date used for API filter */
    syncedFrom: string;
    mode: 'incremental' | 'full';
    durationMs: number;
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

async function resolveOrderLinkFromSource(
    stripe: Stripe,
    sourceId: string | null | undefined,
    balanceTxnId?: string | null,
    opts?: { enrichFromCharge?: boolean }
): Promise<{ orderId: string | null; enrich: Record<string, string> }> {
    const enrich: Record<string, string> = {};
    if (!sourceId && !balanceTxnId) return { orderId: null, enrich };

    const candidateIds = new Set<string>();
    if (sourceId) candidateIds.add(sourceId);
    if (balanceTxnId) candidateIds.add(balanceTxnId);

    // Fast path: solo match DB su stripeTransactionId (niente charge.retrieve a cascata).
    // enrichFromCharge resta disponibile per sync “deep” non usati dal pulsante dashboard.
    if (opts?.enrichFromCharge) {
        try {
            if (sourceId && (sourceId.startsWith('ch_') || sourceId.startsWith('py_'))) {
                const charge = await stripe.charges.retrieve(sourceId, {
                    expand: ['payment_intent'],
                });
                candidateIds.add(charge.id);
                const pi =
                    typeof charge.payment_intent === 'string'
                        ? charge.payment_intent
                        : charge.payment_intent?.id || null;
                if (pi) candidateIds.add(pi);

                const receiptEmail =
                    charge.receipt_email || charge.billing_details?.email || null;
                if (receiptEmail) enrich.receiptEmail = receiptEmail;
                const billingName = charge.billing_details?.name;
                if (billingName) enrich.billingName = billingName;

                const piMeta =
                    typeof charge.payment_intent === 'object' && charge.payment_intent
                        ? charge.payment_intent.metadata || {}
                        : {};
                const orderIdMeta =
                    charge.metadata?.orderId ||
                    (typeof piMeta.orderId === 'string' ? piMeta.orderId : null);
                if (orderIdMeta) {
                    const byId = await prisma.order.findFirst({
                        where: { id: orderIdMeta, deletedAt: null },
                        select: { id: true },
                    });
                    if (byId) return { orderId: byId.id, enrich };
                }

                const orderNumber =
                    charge.metadata?.orderNumber ||
                    (typeof piMeta.orderNumber === 'string' ? piMeta.orderNumber : null);
                if (orderNumber) {
                    const order = await prisma.order.findFirst({
                        where: { orderNumber, deletedAt: null },
                        select: { id: true },
                    });
                    if (order) return { orderId: order.id, enrich };
                }
            }
        } catch {
            /* ignore Stripe retrieve errors */
        }
    }

    const ids = [...candidateIds].filter(Boolean);
    if (ids.length === 0) return { orderId: null, enrich };
    const byTx = await prisma.order.findFirst({
        where: { deletedAt: null, stripeTransactionId: { in: ids } },
        select: { id: true },
    });
    return { orderId: byTx?.id ?? null, enrich };
}

/** Lookup batch: sourceId Stripe → orderId (una sola query). */
async function mapOrdersByStripeSourceIds(
    sourceIds: string[]
): Promise<Map<string, string>> {
    const unique = [...new Set(sourceIds.filter(Boolean))];
    const map = new Map<string, string>();
    if (!unique.length) return map;
    // Chunk IN clause
    for (let i = 0; i < unique.length; i += 200) {
        const chunk = unique.slice(i, i + 200);
        const orders = await prisma.order.findMany({
            where: { deletedAt: null, stripeTransactionId: { in: chunk } },
            select: { id: true, stripeTransactionId: true },
        });
        for (const o of orders) {
            if (o.stripeTransactionId) map.set(o.stripeTransactionId, o.id);
        }
    }
    return map;
}

/** Sincronizza balance transactions per un account. */
export async function syncStripeBalanceMovements(params?: {
    account: StripeAccountConfig;
    createdGte?: Date;
    createdLte?: Date;
    limitPages?: number;
    /** Se true, chiama charges.retrieve per ogni TX (lento). Default false. */
    enrichFromCharge?: boolean;
}): Promise<{ upserted: number; created: number; updated: number; errors: string[] }> {
    if (!params?.account) throw new Error('account Stripe obbligatorio');
    const account = params.account;
    const stripe = makeStripeClient(account.secretKey);
    const errors: string[] = [];
    let upserted = 0;
    let created = 0;
    let updated = 0;
    const limitPages = params?.limitPages ?? 8;
    const enrichFromCharge = params?.enrichFromCharge === true;

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

        const pageRows = list.data;
        const sourceIds = pageRows
            .map((bt) => (typeof bt.source === 'string' ? bt.source : bt.source?.id ?? null))
            .filter((id): id is string => Boolean(id));

        const orderBySource = enrichFromCharge
            ? new Map<string, string>()
            : await mapOrdersByStripeSourceIds(sourceIds);

        // Prefetch existing ids for created/updated counts
        const scopedIds = pageRows.map((bt) => scopedStripeId(account, bt.id));
        const existing = await prisma.stripeFinanceMovement.findMany({
            where: { stripeId: { in: scopedIds } },
            select: { stripeId: true },
        });
        const existingSet = new Set(existing.map((e) => e.stripeId));

        const UPSERT_BATCH = 20;
        for (let i = 0; i < pageRows.length; i += UPSERT_BATCH) {
            const slice = pageRows.slice(i, i + UPSERT_BATCH);
            const results = await Promise.allSettled(
                slice.map(async (bt) => {
                    const sourceId =
                        typeof bt.source === 'string' ? bt.source : bt.source?.id ?? null;
                    let orderId: string | null = null;
                    let enrich: Record<string, string> = {};
                    if (enrichFromCharge) {
                        const linked = await resolveOrderLinkFromSource(
                            stripe,
                            sourceId,
                            bt.id,
                            { enrichFromCharge: true }
                        );
                        orderId = linked.orderId;
                        enrich = linked.enrich;
                    } else if (sourceId && orderBySource.has(sourceId)) {
                        orderId = orderBySource.get(sourceId)!;
                    } else if (orderBySource.has(bt.id)) {
                        orderId = orderBySource.get(bt.id)!;
                    }

                    const stripeId = scopedStripeId(account, bt.id);
                    const meta = accountMeta(account, {
                        rawStripeId: bt.id,
                        fee_details: bt.fee_details as unknown as object[],
                        exchange_rate: bt.exchange_rate,
                        ...enrich,
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
                            availableOn: bt.available_on
                                ? new Date(bt.available_on * 1000)
                                : null,
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
                            availableOn: bt.available_on
                                ? new Date(bt.available_on * 1000)
                                : null,
                            sourceId,
                            orderId: orderId ?? undefined,
                            metadataJson: meta as object,
                            syncedAt: new Date(),
                        },
                    });
                    return { stripeId, wasNew: !existingSet.has(stripeId) };
                })
            );

            for (const r of results) {
                if (r.status === 'fulfilled') {
                    upserted += 1;
                    if (r.value.wasNew) created += 1;
                    else updated += 1;
                } else {
                    errors.push(
                        `${account.code} bt batch: ${
                            r.reason instanceof Error ? r.reason.message : String(r.reason)
                        }`
                    );
                }
            }
        }

        if (!list.has_more || list.data.length === 0) break;
        startingAfter = list.data[list.data.length - 1]?.id;
        if (!startingAfter) break;
    }

    return { upserted, created, updated, errors };
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

/** Calcola createdGte: incremental = max(ultimo in DB − 2gg, ultimi 35gg); full = 01/01/2026. */
export async function resolveStripeSyncFrom(params?: {
    mode?: 'incremental' | 'full';
    createdGte?: Date;
}): Promise<{ createdGte: Date; mode: 'incremental' | 'full' }> {
    if (params?.createdGte) {
        return { createdGte: params.createdGte, mode: params.mode || 'full' };
    }
    const mode = params?.mode || 'incremental';
    const yearStart = new Date('2026-01-01T00:00:00.000Z');
    if (mode === 'full') {
        return { createdGte: yearStart, mode: 'full' };
    }
    const latest = await prisma.stripeFinanceMovement.findFirst({
        where: { createdAtStripe: { gte: yearStart } },
        orderBy: { createdAtStripe: 'desc' },
        select: { createdAtStripe: true },
    });
    const now = Date.now();
    const last35 = new Date(now - 35 * 24 * 60 * 60 * 1000);
    if (!latest?.createdAtStripe) {
        return { createdGte: last35 < yearStart ? yearStart : last35, mode: 'incremental' };
    }
    const overlap = new Date(latest.createdAtStripe.getTime() - 2 * 24 * 60 * 60 * 1000);
    const from = overlap > last35 ? last35 : overlap;
    return {
        createdGte: from < yearStart ? yearStart : from,
        mode: 'incremental',
    };
}

/** Orchestrazione sync completa — COM ed EU in parallelo. */
export async function runStripeFinanceSync(params?: {
    createdGte?: Date;
    limitPages?: number;
    mode?: 'incremental' | 'full';
    /** Default false: evita charge.retrieve per TX (timeout). */
    enrichFromCharge?: boolean;
    /** Default false sul pulsante dashboard: il rebuild ledger è pesante. */
    syncLedger?: boolean;
}): Promise<StripeSyncResult> {
    const t0 = Date.now();
    const resolved = await resolveStripeSyncFrom({
        mode: params?.mode,
        createdGte: params?.createdGte,
    });
    const createdGte = resolved.createdGte;
    const mode = resolved.mode;
    const limitPages = params?.limitPages ?? (mode === 'full' ? 40 : 15);
    const accounts = listConfiguredStripeAccounts();

    if (!accounts.length) {
        return {
            ok: false,
            movementsUpserted: 0,
            movementsCreated: 0,
            movementsUpdated: 0,
            payoutsUpserted: 0,
            invoicesUpserted: 0,
            accountsSynced: [],
            errors: [
                'Nessuna chiave Stripe configurata (STRIPE_SECRET_KEY e/o STRIPE_EU_SECRET_KEY).',
            ],
            syncedFrom: createdGte.toISOString(),
            mode,
            durationMs: Date.now() - t0,
        };
    }

    const accountJobs = accounts.map(async (account) => {
        const accErrors: string[] = [];
        let movU = 0;
        let movC = 0;
        let movUpd = 0;
        let poU = 0;
        let invU = 0;

        try {
            const mov = await syncStripeBalanceMovements({
                account,
                createdGte,
                limitPages,
                enrichFromCharge: params?.enrichFromCharge === true,
            });
            movU = mov.upserted;
            movC = mov.created;
            movUpd = mov.updated;
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
                limitPages: Math.min(limitPages, 10),
            });
            poU = po.upserted;
            accErrors.push(...po.errors);
        } catch (err) {
            accErrors.push(
                `${account.code} payouts: ${err instanceof Error ? err.message : String(err)}`
            );
        }

        try {
            // Solo ultimi mesi — le fatture fee Stripe non richiedono YTD completo
            const inv = await syncStripeServiceInvoices({
                account,
                monthsBack: mode === 'full' ? 12 : 4,
            });
            invU = inv.upserted;
            accErrors.push(...inv.errors);
        } catch (err) {
            accErrors.push(
                `${account.code} invoices: ${err instanceof Error ? err.message : String(err)}`
            );
        }

        return {
            code: account.code,
            label: account.label,
            movementsUpserted: movU,
            movementsCreated: movC,
            movementsUpdated: movUpd,
            payoutsUpserted: poU,
            invoicesUpserted: invU,
            errors: accErrors,
        };
    });

    const settled = await Promise.allSettled(accountJobs);
    const errors: string[] = [];
    let movementsUpserted = 0;
    let movementsCreated = 0;
    let movementsUpdated = 0;
    let payoutsUpserted = 0;
    let invoicesUpserted = 0;
    const accountsSynced: StripeSyncResult['accountsSynced'] = [];

    for (const s of settled) {
        if (s.status === 'rejected') {
            errors.push(s.reason instanceof Error ? s.reason.message : String(s.reason));
            continue;
        }
        const a = s.value;
        movementsUpserted += a.movementsUpserted;
        movementsCreated += a.movementsCreated;
        movementsUpdated += a.movementsUpdated;
        payoutsUpserted += a.payoutsUpserted;
        invoicesUpserted += a.invoicesUpserted;
        errors.push(...a.errors);
        accountsSynced.push({
            code: a.code,
            label: a.label,
            movementsUpserted: a.movementsUpserted,
            payoutsUpserted: a.payoutsUpserted,
            invoicesUpserted: a.invoicesUpserted,
            errors: a.errors,
        });
    }

    if (params?.syncLedger === true) {
        try {
            const { syncHistoricalLedgerFromSources } = await import(
                '@/lib/financial/historicalLedgerSync'
            );
            await syncHistoricalLedgerFromSources();
        } catch (err) {
            errors.push(`ledger: ${err instanceof Error ? err.message : String(err)}`);
        }
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
        movementsCreated,
        movementsUpdated,
        payoutsUpserted,
        invoicesUpserted,
        accountsSynced,
        errors,
        syncedFrom: createdGte.toISOString(),
        mode,
        durationMs: Date.now() - t0,
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
