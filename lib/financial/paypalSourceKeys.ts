/**
 * Chiavi univoche PayPal standardizzate per API / Webhook / CSV.
 * Formato obbligatorio:
 *   PAYPAL_TX:<transaction_id>
 *   PAYPAL_FEE:<transaction_id>
 *   PAYPAL_PAYOUT:<transaction_id>
 *   PAYPAL_REFUND:<transaction_id>
 */

export type PaypalLedgerKind = 'TX' | 'FEE' | 'PAYOUT' | 'REFUND';

const KEY_RE =
    /^PAYPAL_(TX|FEE|PAYOUT|REFUND)(?::(TX|REFUND))?:(.+)$/i;

/** Normalizza l'ID reale PayPal (toglie prefissi legacy e fee_). */
export function normalizePaypalTransactionId(raw: string | null | undefined): string {
    if (!raw) return '';
    let id = String(raw).trim();
    if (!id) return '';
    id = id.replace(/^fee_/i, '');
    id = id.replace(/^PAYPAL_(TX|FEE|PAYOUT|REFUND)(?::(TX|REFUND))?:/i, '');
    return id.trim();
}

export function paypalTxSourceKey(transactionId: string): string {
    return `PAYPAL_TX:${normalizePaypalTransactionId(transactionId)}`.slice(0, 180);
}

export function paypalFeeSourceKey(transactionId: string): string {
    return `PAYPAL_FEE:${normalizePaypalTransactionId(transactionId)}`.slice(0, 180);
}

export function paypalPayoutSourceKey(transactionId: string): string {
    return `PAYPAL_PAYOUT:${normalizePaypalTransactionId(transactionId)}`.slice(0, 180);
}

export function paypalRefundSourceKey(transactionId: string): string {
    return `PAYPAL_REFUND:${normalizePaypalTransactionId(transactionId)}`.slice(0, 180);
}

export function paypalCanonicalSourceKey(
    kind: PaypalLedgerKind,
    transactionId: string
): string {
    switch (kind) {
        case 'FEE':
            return paypalFeeSourceKey(transactionId);
        case 'PAYOUT':
            return paypalPayoutSourceKey(transactionId);
        case 'REFUND':
            return paypalRefundSourceKey(transactionId);
        default:
            return paypalTxSourceKey(transactionId);
    }
}

/**
 * Interpreta sourceKey legacy e attuali → kind + id + chiave canonica.
 * Copre PAYPAL_FEE:TX:id e PAYPAL_FEE:REFUND:id del webhook/CSV storici.
 */
export function parsePaypalSourceKey(sourceKey: string): {
    kind: PaypalLedgerKind;
    transactionId: string;
    canonicalKey: string;
    isLegacy: boolean;
} | null {
    const raw = String(sourceKey || '').trim();
    if (!raw.toUpperCase().startsWith('PAYPAL_')) return null;

    const m = raw.match(KEY_RE);
    if (!m) {
        // Fallback: PAYPAL_MOVEMENT senza schema tipizzato
        const id = normalizePaypalTransactionId(raw);
        if (!id) return null;
        return {
            kind: 'TX',
            transactionId: id,
            canonicalKey: paypalTxSourceKey(id),
            isLegacy: true,
        };
    }

    const primary = m[1].toUpperCase() as PaypalLedgerKind;
    const middle = m[2]?.toUpperCase() || null;
    const transactionId = normalizePaypalTransactionId(m[3]);
    if (!transactionId) return null;

    const isLegacy = Boolean(middle); // FEE:TX: / FEE:REFUND:
    const kind: PaypalLedgerKind = primary;
    return {
        kind,
        transactionId,
        canonicalKey: paypalCanonicalSourceKey(kind, transactionId),
        isLegacy,
    };
}

/** Tutte le chiavi storiche possibili per lo stesso evento (idempotenza pre-insert). */
export function paypalSourceKeyAliases(
    kind: PaypalLedgerKind,
    transactionId: string
): string[] {
    const id = normalizePaypalTransactionId(transactionId);
    if (!id) return [];
    const canonical = paypalCanonicalSourceKey(kind, id);
    const aliases = new Set<string>([canonical]);
    if (kind === 'FEE') {
        aliases.add(`PAYPAL_FEE:TX:${id}`.slice(0, 180));
        aliases.add(`PAYPAL_FEE:REFUND:${id}`.slice(0, 180));
    }
    if (kind === 'TX') {
        // raramente webhook/CSV hanno scritto REFUND per lo stesso id
        aliases.add(paypalRefundSourceKey(id));
    }
    return [...aliases];
}

export function inferPaypalKindFromCategory(
    category: string,
    opts?: { isRefund?: boolean; totalCents?: number }
): PaypalLedgerKind {
    if (opts?.isRefund || category === 'RIMBORSI') return 'REFUND';
    if (category === 'ONERI_BANCARI') return 'FEE';
    if (category === 'PAYPAL_PAYOUT') return 'PAYOUT';
    return 'TX';
}
