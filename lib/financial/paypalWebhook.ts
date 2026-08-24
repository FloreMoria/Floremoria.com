/**
 * Webhook PayPal → Registro Storico Permanente (FinancialLedgerEntry).
 * Verifica firma via /v1/notifications/verify-webhook-signature; idempotenza su sourceKey.
 */

import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';
import type { LedgerEntryInput } from '@/lib/financial/historicalLedgerTypes';
import { LEDGER_PAYPAL_ACCOUNT } from '@/lib/financial/companyBankDetails';
import { classifyPaypalTransaction } from '@/lib/financial/paypalClassify';
import { getPaypalAccessToken, paypalBaseUrl } from '@/lib/financial/paypalSync';
import {
    paypalFeeSourceKey,
    paypalRefundSourceKey,
    paypalTxSourceKey,
} from '@/lib/financial/paypalSourceKeys';
import {
    paypalCanonicalAlreadyRecorded,
} from '@/lib/financial/paypalLedgerSanitize';
import { sanitizeLedgerDoubleEntryAnomalies } from '@/lib/financial/ledgerDoubleEntrySanitize';

export type PaypalWebhookEvent = {
    id?: string;
    event_type?: string;
    create_time?: string;
    resource_type?: string;
    resource?: Record<string, unknown>;
    summary?: string;
};

const PAYMENT_EVENT_TYPES = new Set([
    'PAYMENT.CAPTURE.COMPLETED',
    'PAYMENT.SALE.COMPLETED',
    'CHECKOUT.ORDER.APPROVED',
]);

const REFUND_EVENT_TYPES = new Set(['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.SALE.REFUNDED']);

type ParsedMovement = {
    transactionId: string;
    accountingDate: Date;
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    description: string;
    payerEmail?: string | null;
    isRefund: boolean;
};

function parseMoney(value: unknown, currency?: unknown): { cents: number; currency: string } {
    const cur = typeof currency === 'string' ? currency.toUpperCase() : 'EUR';
    if (value == null) return { cents: 0, currency: cur };
    if (typeof value === 'object' && value !== null) {
        const obj = value as { value?: string; currency_code?: string; currency?: string };
        return parseMoney(obj.value, obj.currency_code || obj.currency || cur);
    }
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n)) return { cents: 0, currency: cur };
    return { cents: Math.round(n * 100), currency: cur };
}

function parsePaypalDate(raw: unknown): Date {
    if (typeof raw !== 'string' || !raw.trim()) return new Date();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

function breakdownFromResource(resource: Record<string, unknown>, isRefund: boolean): {
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
} {
    const breakdown =
        (resource.seller_receivable_breakdown as Record<string, unknown> | undefined) ||
        (resource.seller_payable_breakdown as Record<string, unknown> | undefined);

    if (breakdown) {
        const gross = parseMoney(breakdown.gross_amount);
        const fee = parseMoney(breakdown.paypal_fee);
        const net = parseMoney(breakdown.net_amount);
        const grossCents = Math.abs(gross.cents) * (isRefund ? -1 : 1);
        const feeCents = Math.abs(fee.cents);
        const netCents =
            net.cents !== 0
                ? net.cents
                : grossCents - (grossCents >= 0 ? feeCents : -feeCents);
        return { grossCents, feeCents, netCents, currency: gross.currency };
    }

    const amount =
        (resource.amount as Record<string, unknown> | undefined) ||
        (resource.transaction_amount as Record<string, unknown> | undefined);
    const gross = parseMoney(
        amount?.value ?? amount?.total,
        amount?.currency_code ?? amount?.currency
    );
    const feeObj = resource.transaction_fee as Record<string, unknown> | undefined;
    const fee = parseMoney(feeObj?.value, feeObj?.currency ?? gross.currency);
    const grossCents = Math.abs(gross.cents) * (isRefund ? -1 : 1);
    const feeCents = Math.abs(fee.cents);
    return {
        grossCents,
        feeCents,
        netCents: grossCents - (grossCents >= 0 ? feeCents : -feeCents),
        currency: gross.currency,
    };
}

function movementFromResource(
    resource: Record<string, unknown>,
    opts: { isRefund: boolean; eventType: string; fallbackDate?: string }
): ParsedMovement | null {
    const transactionId = typeof resource.id === 'string' ? resource.id : null;
    if (!transactionId) return null;

    const { grossCents, feeCents, netCents, currency } = breakdownFromResource(
        resource,
        opts.isRefund
    );
    if (currency !== 'EUR') return null;
    if (grossCents === 0 && feeCents === 0) return null;

    const accountingDate = parsePaypalDate(
        resource.update_time ||
            resource.create_time ||
            opts.fallbackDate ||
            new Date().toISOString()
    );

    const payer =
        (resource.payer as { email_address?: string } | undefined)?.email_address ||
        (resource.payer_info as { email_address?: string } | undefined)?.email_address ||
        null;

    const description =
        (typeof resource.custom_id === 'string' && resource.custom_id) ||
        (typeof resource.invoice_id === 'string' && resource.invoice_id) ||
        `${opts.isRefund ? 'Rimborso' : 'Incasso'} PayPal ${transactionId} (${opts.eventType})`;

    return {
        transactionId,
        accountingDate,
        grossCents,
        feeCents,
        netCents,
        currency,
        description: description.slice(0, 2000),
        payerEmail: payer,
        isRefund: opts.isRefund,
    };
}

/** Estrae uno o più movimenti da resource (capture/sale/refund/order). */
export function extractMovementsFromPaypalEvent(event: PaypalWebhookEvent): ParsedMovement[] {
    const eventType = event.event_type || '';
    const resource = event.resource;
    if (!resource || typeof resource !== 'object') return [];

    const fallbackDate = event.create_time;

    if (REFUND_EVENT_TYPES.has(eventType)) {
        const one = movementFromResource(resource, { isRefund: true, eventType, fallbackDate });
        return one ? [one] : [];
    }

    if (eventType === 'CHECKOUT.ORDER.APPROVED') {
        const units = Array.isArray(resource.purchase_units)
            ? (resource.purchase_units as Record<string, unknown>[])
            : [];
        const out: ParsedMovement[] = [];
        for (const unit of units) {
            const payments = unit.payments as Record<string, unknown> | undefined;
            const captures = Array.isArray(payments?.captures)
                ? (payments!.captures as Record<string, unknown>[])
                : [];
            for (const cap of captures) {
                if (String(cap.status || '').toUpperCase() !== 'COMPLETED') continue;
                const mv = movementFromResource(cap, {
                    isRefund: false,
                    eventType,
                    fallbackDate,
                });
                if (mv) out.push(mv);
            }
        }
        return out;
    }

    if (PAYMENT_EVENT_TYPES.has(eventType)) {
        const one = movementFromResource(resource, { isRefund: false, eventType, fallbackDate });
        return one ? [one] : [];
    }

    return [];
}

function ledgerEntriesForMovement(mv: ParsedMovement): LedgerEntryInput[] {
    const FEE_ACCOUNT = '70200 - Oneri bancari / Fee PayPal';
    const REVENUE_ACCOUNT = '60100 - Ricavi da Vendite';
    const SAAS_ACCOUNT = '70900 - Spese operative/SaaS';

    const classified = classifyPaypalTransaction({
        description: mv.description,
        grossCents: mv.grossCents,
        feeCents: mv.feeCents,
        payerEmail: mv.payerEmail,
    });
    if (!classified.record && !mv.isRefund) {
        return [];
    }

    const txKey = mv.isRefund
        ? paypalRefundSourceKey(mv.transactionId)
        : paypalTxSourceKey(mv.transactionId);
    const feeKey = paypalFeeSourceKey(mv.transactionId);
    const category = mv.isRefund ? 'RIMBORSI' : classified.category;
    const direction = mv.isRefund
        ? mv.grossCents >= 0
            ? 'ENTRATA'
            : 'USCITA'
        : classified.direction;
    const entries: LedgerEntryInput[] = [];

    if (mv.grossCents !== 0) {
        const isIn = direction === 'ENTRATA';
        entries.push({
            sourceKey: txKey,
            sourceType: 'PAYPAL_MOVEMENT',
            sourceId: mv.transactionId.slice(0, 128),
            direction,
            category,
            accountingDate: mv.accountingDate,
            description: mv.description,
            counterpartyName: mv.payerEmail || 'PayPal',
            netCents: mv.grossCents,
            vatRate: 0,
            vatCents: 0,
            totalCents: mv.grossCents,
            reconciliationStatus: 'UNMATCHED',
            documentRef: mv.transactionId,
            metadataJson: {
                provider: 'paypal',
                webhook: true,
                feeCents: mv.feeCents,
                netCents: mv.netCents,
                isRefund: mv.isRefund,
                classifyReason: classified.reason,
                paypalTransactionId: mv.transactionId,
                dareAccount: isIn
                    ? LEDGER_PAYPAL_ACCOUNT
                    : category === 'SPESE_SAAS'
                      ? SAAS_ACCOUNT
                      : SAAS_ACCOUNT,
                avereAccount: isIn ? REVENUE_ACCOUNT : LEDGER_PAYPAL_ACCOUNT,
            },
        });
    }

    if (mv.feeCents > 0 && direction === 'ENTRATA') {
        const feeSigned = mv.isRefund ? mv.feeCents : -mv.feeCents;
        entries.push({
            sourceKey: feeKey,
            sourceType: 'PAYPAL_MOVEMENT',
            sourceId: `fee_${mv.transactionId}`.slice(0, 128),
            direction: feeSigned >= 0 ? 'ENTRATA' : 'USCITA',
            category: 'ONERI_BANCARI',
            accountingDate: mv.accountingDate,
            description: mv.isRefund
                ? `Storno commissione PayPal — rimborso ${mv.transactionId}`
                : `Commissione PayPal — ${mv.transactionId}`,
            counterpartyName: 'PayPal',
            netCents: feeSigned,
            vatRate: 0,
            vatCents: 0,
            totalCents: feeSigned,
            reconciliationStatus: mv.isRefund ? 'UNMATCHED' : 'MATCHED',
            documentRef: mv.transactionId,
            metadataJson: {
                provider: 'paypal',
                webhook: true,
                isRefund: mv.isRefund,
                feeReversal: mv.isRefund,
                paypalTransactionId: mv.transactionId,
                dareAccount: FEE_ACCOUNT,
                avereAccount: LEDGER_PAYPAL_ACCOUNT,
            },
        });
    }

    return entries;
}

/** Idempotenza: sourceKey canonica + alias legacy (FEE:TX:, FEE:REFUND:). */
export async function paypalMovementAlreadyRecorded(
    transactionId: string,
    isRefund: boolean
): Promise<boolean> {
    return paypalCanonicalAlreadyRecorded(isRefund ? 'REFUND' : 'TX', transactionId);
}

export async function verifyPaypalWebhookSignature(
    webhookEvent: unknown,
    headers: Headers
): Promise<boolean> {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
    if (!webhookId) {
        console.error('[paypal-webhook] PAYPAL_WEBHOOK_ID non configurato');
        return false;
    }

    const authAlgo = headers.get('paypal-auth-algo');
    const certUrl = headers.get('paypal-cert-url');
    const transmissionId = headers.get('paypal-transmission-id');
    const transmissionSig = headers.get('paypal-transmission-sig');
    const transmissionTime = headers.get('paypal-transmission-time');

    if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
        console.warn('[paypal-webhook] Header firma PayPal incompleti');
        return false;
    }

    try {
        const accessToken = await getPaypalAccessToken();
        const res = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                auth_algo: authAlgo,
                cert_url: certUrl,
                transmission_id: transmissionId,
                transmission_sig: transmissionSig,
                transmission_time: transmissionTime,
                webhook_id: webhookId,
                webhook_event: webhookEvent,
            }),
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.error('[paypal-webhook] verify-webhook-signature HTTP', res.status, body.slice(0, 300));
            return false;
        }

        const data = (await res.json()) as { verification_status?: string };
        return data.verification_status === 'SUCCESS';
    } catch (err) {
        console.error('[paypal-webhook] verify-webhook-signature errore:', err);
        return false;
    }
}

export async function processPaypalWebhookEvent(event: PaypalWebhookEvent): Promise<{
    eventType: string;
    movementsProcessed: number;
    inserted: number;
    skipped: number;
    ignored: boolean;
}> {
    const eventType = event.event_type || 'UNKNOWN';
    const isHandled =
        PAYMENT_EVENT_TYPES.has(eventType) || REFUND_EVENT_TYPES.has(eventType);

    if (!isHandled) {
        return {
            eventType,
            movementsProcessed: 0,
            inserted: 0,
            skipped: 0,
            ignored: true,
        };
    }

    const movements = extractMovementsFromPaypalEvent(event);
    if (!movements.length) {
        return {
            eventType,
            movementsProcessed: 0,
            inserted: 0,
            skipped: 0,
            ignored: false,
        };
    }

    const ledgerBatch: LedgerEntryInput[] = [];
    let skipped = 0;

    for (const mv of movements) {
        const exists = await paypalMovementAlreadyRecorded(mv.transactionId, mv.isRefund);
        if (exists) {
            skipped += 1;
            continue;
        }
        ledgerBatch.push(...ledgerEntriesForMovement(mv));
    }

    const { inserted, skipped: dupSkipped } = await appendLedgerEntries(ledgerBatch);
    await sanitizeLedgerDoubleEntryAnomalies();

    return {
        eventType,
        movementsProcessed: movements.length,
        inserted,
        skipped: skipped + dupSkipped,
        ignored: false,
    };
}
