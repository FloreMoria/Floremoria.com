/**
 * Sync PayPal Transaction Search API → ledger + SystemState cache.
 * Assumption: PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET (+ PAYPAL_MODE=live|sandbox).
 */

import prisma from '@/lib/prisma';
import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';
import {
    LEDGER_PAYPAL_ACCOUNT,
} from '@/lib/financial/companyBankDetails';
import { classifyPaypalTransaction } from '@/lib/financial/paypalClassify';
import {
    paypalFeeSourceKey,
    paypalRefundSourceKey,
    paypalTxSourceKey,
} from '@/lib/financial/paypalSourceKeys';
import { sanitizeLedgerDoubleEntryAnomalies } from '@/lib/financial/ledgerDoubleEntrySanitize';

const SYNC_META_KEY = 'finance.paypal.last_sync';
const TX_CACHE_KEY = 'finance.paypal.transactions';

export type PaypalSyncResult = {
    ok: boolean;
    transactionsUpserted: number;
    feesUpserted: number;
    errors: string[];
    lastSyncAt: string;
    /** Reporting API non autorizzata (403) — usare upload CSV storico + webhook live. */
    apiForbidden?: boolean;
};

export type PaypalTx = {
    id: string;
    status: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    transactionDate: string;
    description: string;
    payerEmail?: string | null;
    eventCode?: string | null;
};

export function paypalBaseUrl(): string {
    const mode = (process.env.PAYPAL_MODE || 'live').toLowerCase();
    return mode === 'sandbox'
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';
}

export async function getPaypalAccessToken(): Promise<string> {
    const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
    const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
    if (!clientId || !secret) {
        throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET non configurati');
    }
    const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
    const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
        throw new Error(`PayPal OAuth fallito (HTTP ${res.status})`);
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) throw new Error('PayPal OAuth: access_token assente');
    return data.access_token;
}

function parseAmount(raw: string | undefined, currency?: string): number {
    if (!raw) return 0;
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n)) return 0;
    // PayPal amounts are decimal currency units
    return Math.round(n * 100);
}

async function fetchPaypalTransactions(params: {
    startDate: Date;
    endDate: Date;
    accessToken: string;
}): Promise<{ txs: PaypalTx[]; errors: string[]; apiForbidden?: boolean }> {
    const errors: string[] = [];
    const txs: PaypalTx[] = [];
    let apiForbidden = false;
    let page = 1;
    const maxPages = 40;

    while (page <= maxPages) {
        const url = new URL(`${paypalBaseUrl()}/v1/reporting/transactions`);
        url.searchParams.set('start_date', params.startDate.toISOString());
        url.searchParams.set('end_date', params.endDate.toISOString());
        url.searchParams.set('fields', 'all');
        url.searchParams.set('page_size', '100');
        url.searchParams.set('page', String(page));

        const res = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${params.accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            if (res.status === 403) {
                apiForbidden = true;
                errors.push('PAYPAL_API_FORBIDDEN');
            } else {
                errors.push(
                    `PayPal transactions page ${page}: HTTP ${res.status} ${body.slice(0, 180)}`
                );
            }
            break;
        }

        const data = (await res.json()) as {
            transaction_details?: Array<{
                transaction_info?: {
                    transaction_id?: string;
                    transaction_status?: string;
                    transaction_event_code?: string;
                    transaction_amount?: { value?: string; currency_code?: string };
                    fee_amount?: { value?: string; currency_code?: string };
                    transaction_initiation_date?: string;
                    transaction_subject?: string;
                    transaction_note?: string;
                };
                payer_info?: { email_address?: string };
            }>;
            total_pages?: number;
        };

        const details = data.transaction_details || [];
        for (const d of details) {
            const info = d.transaction_info;
            if (!info?.transaction_id) continue;
            const currency = info.transaction_amount?.currency_code || 'EUR';
            if (currency.toUpperCase() !== 'EUR') continue;
            const grossCents = parseAmount(info.transaction_amount?.value);
            const feeCents = Math.abs(parseAmount(info.fee_amount?.value));
            // Solo lordo: mai registrare il netto come seconda scrittura
            const netCents = grossCents - (grossCents >= 0 ? feeCents : -feeCents);
            txs.push({
                id: info.transaction_id,
                status: info.transaction_status || 'UNKNOWN',
                grossCents,
                feeCents,
                netCents,
                currency: currency.toLowerCase(),
                transactionDate:
                    info.transaction_initiation_date || new Date().toISOString(),
                description:
                    info.transaction_subject ||
                    info.transaction_note ||
                    `PayPal ${info.transaction_id}`,
                payerEmail: d.payer_info?.email_address || null,
                eventCode: info.transaction_event_code || null,
            });
        }

        const totalPages = data.total_pages || 1;
        if (page >= totalPages || details.length === 0) break;
        page += 1;
    }

    return { txs, errors, apiForbidden: apiForbidden || undefined };
}

export async function runPaypalFinanceSync(params?: {
    createdGte?: Date;
}): Promise<PaypalSyncResult> {
    const createdGte = params?.createdGte || new Date('2026-01-01T00:00:00.000Z');
    const endDate = new Date();
    const errors: string[] = [];
    let transactionsUpserted = 0;
    let feesUpserted = 0;
    let apiForbidden = false;

    try {
        const accessToken = await getPaypalAccessToken();
        // PayPal richiede finestre ≤ 31 giorni: spezza per mesi
        const cursor = new Date(createdGte);
        const allTxs: PaypalTx[] = [];
        while (cursor < endDate) {
            const chunkEnd = new Date(cursor);
            chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 30);
            if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
            const { txs, errors: chunkErr, apiForbidden: chunkForbidden } =
                await fetchPaypalTransactions({
                    startDate: new Date(cursor),
                    endDate: chunkEnd,
                    accessToken,
                });
            allTxs.push(...txs);
            errors.push(...chunkErr);
            if (chunkForbidden) apiForbidden = true;
            cursor.setTime(chunkEnd.getTime() + 1000);
            if (chunkErr.length) break;
        }

        if (apiForbidden) {
            return {
                ok: false,
                transactionsUpserted: 0,
                feesUpserted: 0,
                errors,
                lastSyncAt: new Date().toISOString(),
                apiForbidden: true,
            };
        }

        const ledger = [];
        const FEE_ACCOUNT = '70200 - Oneri bancari / Fee PayPal';
        const REVENUE_ACCOUNT = '60100 - Ricavi da Vendite';
        const SAAS_ACCOUNT = '70900 - Spese operative/SaaS';

        for (const tx of allTxs) {
            const accountingDate = new Date(tx.transactionDate);
            if (Number.isNaN(accountingDate.getTime())) continue;

            const classified = classifyPaypalTransaction({
                description: tx.description,
                grossCents: tx.grossCents,
                feeCents: tx.feeCents,
                eventCode: tx.eventCode,
                payerEmail: tx.payerEmail,
                counterpartyName: tx.description,
            });

            if (!classified.record) {
                continue;
            }

            const isRefund = classified.category === 'RIMBORSI';

            if (tx.grossCents !== 0) {
                const isIn = classified.direction === 'ENTRATA';
                const dareAccount = isIn
                    ? LEDGER_PAYPAL_ACCOUNT
                    : classified.category === 'SPESE_SAAS'
                      ? SAAS_ACCOUNT
                      : classified.category === 'ONERI_BANCARI'
                        ? FEE_ACCOUNT
                        : '70900 - Spese operative';
                const avereAccount = isIn
                    ? classified.category === 'RIMBORSI'
                        ? SAAS_ACCOUNT
                        : REVENUE_ACCOUNT
                    : LEDGER_PAYPAL_ACCOUNT;

                ledger.push({
                    sourceKey: (isRefund
                        ? paypalRefundSourceKey(tx.id)
                        : paypalTxSourceKey(tx.id)
                    ).slice(0, 180),
                    sourceType: 'PAYPAL_MOVEMENT' as const,
                    sourceId: tx.id.slice(0, 128),
                    direction: classified.direction,
                    category: classified.category,
                    accountingDate,
                    description: tx.description.slice(0, 2000),
                    counterpartyName: tx.payerEmail || 'PayPal',
                    netCents: tx.grossCents,
                    vatRate: 0,
                    vatCents: 0,
                    totalCents: tx.grossCents,
                    reconciliationStatus: 'UNMATCHED' as const,
                    documentRef: tx.id,
                    metadataJson: {
                        provider: 'paypal',
                        feeCents: tx.feeCents,
                        netCents: tx.netCents,
                        status: tx.status,
                        eventCode: tx.eventCode,
                        syncedFromApi: true,
                        isRefund,
                        classifyReason: classified.reason,
                        paypalTransactionId: tx.id,
                        dareAccount,
                        avereAccount,
                    },
                });
                transactionsUpserted += 1;
            }

            // Fee solo su incassi commerciali (mai su SaaS / rimborsi merchant)
            if (
                tx.feeCents > 0 &&
                classified.direction === 'ENTRATA' &&
                classified.category === 'RICAVI_VENDITE'
            ) {
                ledger.push({
                    sourceKey: paypalFeeSourceKey(tx.id),
                    sourceType: 'PAYPAL_MOVEMENT' as const,
                    sourceId: `fee_${tx.id}`.slice(0, 128),
                    direction: 'USCITA' as const,
                    category: 'ONERI_BANCARI' as const,
                    accountingDate,
                    description: `Commissione PayPal — ${tx.id}`,
                    counterpartyName: 'PayPal',
                    netCents: -Math.abs(tx.feeCents),
                    vatRate: 0,
                    vatCents: 0,
                    totalCents: -Math.abs(tx.feeCents),
                    reconciliationStatus: 'MATCHED' as const,
                    documentRef: tx.id,
                    metadataJson: {
                        provider: 'paypal',
                        syncedFromApi: true,
                        paypalTransactionId: tx.id,
                        dareAccount: FEE_ACCOUNT,
                        avereAccount: LEDGER_PAYPAL_ACCOUNT,
                    },
                });
                feesUpserted += 1;
            }
        }

        if (ledger.length) {
            await appendLedgerEntries(ledger);
        }

        await sanitizeLedgerDoubleEntryAnomalies();

        const lastSyncAt = new Date().toISOString();
        await prisma.systemState.upsert({
            where: { key: SYNC_META_KEY },
            create: { key: SYNC_META_KEY, value: lastSyncAt },
            update: { value: lastSyncAt },
        });
        await prisma.systemState.upsert({
            where: { key: TX_CACHE_KEY },
            create: {
                key: TX_CACHE_KEY,
                value: JSON.stringify(allTxs.slice(0, 500)),
            },
            update: { value: JSON.stringify(allTxs.slice(0, 500)) },
        });

        return {
            ok: errors.length === 0,
            transactionsUpserted,
            feesUpserted,
            errors,
            lastSyncAt,
            apiForbidden: false,
        };
    } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        return {
            ok: false,
            transactionsUpserted,
            feesUpserted,
            errors,
            lastSyncAt: new Date().toISOString(),
            apiForbidden,
        };
    }
}

export async function getPaypalSyncStatus(): Promise<{
    lastSyncAt: string | null;
    transactions: PaypalTx[];
    count: number;
}> {
    const [meta, cache] = await Promise.all([
        prisma.systemState.findUnique({ where: { key: SYNC_META_KEY } }),
        prisma.systemState.findUnique({ where: { key: TX_CACHE_KEY } }),
    ]);
    let transactions: PaypalTx[] = [];
    try {
        transactions = cache?.value ? (JSON.parse(cache.value) as PaypalTx[]) : [];
    } catch {
        transactions = [];
    }
    return {
        lastSyncAt: meta?.value || null,
        transactions: Array.isArray(transactions) ? transactions : [],
        count: Array.isArray(transactions) ? transactions.length : 0,
    };
}
