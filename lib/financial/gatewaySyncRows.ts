/**
 * Unifica e deduplica movimenti Stripe (COM/EU) + PayPal (API/Webhook/CSV)
 * per la tabella "Sincronizzazione API Gateway".
 */

import { normalizePaypalTransactionId, parsePaypalSourceKey } from '@/lib/financial/paypalSourceKeys';

export type GatewayKind = 'stripe' | 'paypal';

export type MovementKind =
    | 'incasso'
    | 'commissione'
    | 'payout'
    | 'rimborso'
    | 'riserva'
    | 'altro';

export type GatewaySourceLabel =
    | 'API Stripe'
    | 'Webhook PayPal'
    | 'API PayPal'
    | 'CSV Import'
    | 'PayPal';

export type GatewaySyncRow = {
    id: string;
    /** ISO 8601 — timestamp reale della transazione */
    occurredAt: string;
    gateway: GatewayKind;
    accountCode: string;
    accountLabel: string;
    movementKind: MovementKind;
    movementLabel: string;
    description: string;
    customerName: string | null;
    customerEmail: string | null;
    reference: string | null;
    transactionId: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    statusLabel: string;
    sourceLabel: GatewaySourceLabel;
    dedupeKey: string;
};

const SKIP_STRIPE_TYPES = new Set([
    'advance',
    'advance_funding',
    'financing_paydown',
    'financing_paydown_reversal',
    'financing_payout',
    'financing_payout_reversal',
    'reserved_funds',
    'obligation_outbound',
    'obligation_reversal_outbound',
    'obligation_inbound',
]);

function asMeta(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object') return {};
    return raw as Record<string, unknown>;
}

function str(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t || null;
}

export function parseIsoDate(raw: unknown): string | null {
    if (raw == null || raw === '') return null;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        const ms = raw < 1e12 ? raw * 1000 : raw;
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof raw === 'string') {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
        const it = raw.match(
            /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
        );
        if (it) {
            const iso = `${it[3]}-${it[2].padStart(2, '0')}-${it[1].padStart(2, '0')}T${(
                it[4] || '12'
            ).padStart(2, '0')}:${(it[5] || '00').padStart(2, '0')}:${(it[6] || '00').padStart(2, '0')}.000Z`;
            const d2 = new Date(iso);
            return Number.isNaN(d2.getTime()) ? null : d2.toISOString();
        }
    }
    return null;
}

/** DD/MM/YYYY HH:mm — evita timeStyle su toLocaleDateString (RangeError → "—"). */
export function formatGatewayDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function classifyStripeType(type: string, amountCents: number): {
    kind: MovementKind;
    label: string;
} {
    const t = (type || '').toLowerCase();
    if (t === 'charge' || t === 'payment') return { kind: 'incasso', label: 'Incasso Ordine' };
    if (t === 'payment_refund' || t === 'refund' || t === 'refund_failure')
        return { kind: 'rimborso', label: 'Rimborso' };
    if (t === 'stripe_fee' || t === 'network_cost')
        return { kind: 'commissione', label: 'Commissione Gateway' };
    if (t === 'payout' || t === 'payout_cancel' || t === 'payout_failure')
        return { kind: 'payout', label: 'Payout Bancario' };
    if (t.includes('reserve')) return { kind: 'riserva', label: 'Riserva' };
    if (amountCents < 0 && (t === 'adjustment' || t === 'fee'))
        return { kind: 'commissione', label: 'Commissione Gateway' };
    return { kind: 'altro', label: 'Altro movimento' };
}

function classifyPaypal(description: string, grossCents: number): {
    kind: MovementKind;
    label: string;
} {
    const d = description.toLowerCase();
    if (/rimborso|refund/.test(d)) return { kind: 'rimborso', label: 'Rimborso' };
    if (/tariffa|fee|commissione/.test(d) && !/pagamento|payment|checkout/.test(d))
        return { kind: 'commissione', label: 'Commissione Gateway' };
    if (/trasferimento|withdrawal|payout|bonifico|user initiated|prelievo/.test(d))
        return { kind: 'payout', label: 'Payout Bancario' };
    if (grossCents >= 0) return { kind: 'incasso', label: 'Incasso Ordine' };
    return { kind: 'altro', label: 'Movimento PayPal' };
}

function rawStripeId(stripeId: string, meta: Record<string, unknown>): string {
    const raw = str(meta.rawStripeId);
    if (raw) return raw;
    return stripeId
        .replace(/^stripe_eu_tx_/, '')
        .replace(/^stripe_tx_/, '')
        .replace(/^stripe_eu_/, '')
        .replace(/^stripe_/, '');
}

export type StripeMovementInput = {
    id?: string;
    stripeId?: string;
    type?: string;
    description?: string | null;
    amountCents?: number;
    feeCents?: number;
    netCents?: number;
    currency?: string;
    status?: string | null;
    createdAtStripe?: string | Date | null;
    sourceId?: string | null;
    payoutId?: string | null;
    orderId?: string | null;
    metadataJson?: unknown;
    accountCode?: string;
    accountLabel?: string;
    order?: {
        orderNumber?: string | null;
        buyerFullName?: string | null;
        buyerEmail?: string | null;
    } | null;
};

export function mapStripeMovementToRow(m: StripeMovementInput): GatewaySyncRow | null {
    const type = String(m.type || '');
    if (SKIP_STRIPE_TYPES.has(type)) return null;

    const meta = asMeta(m.metadataJson);
    const stripeId = String(m.stripeId || m.id || '');
    if (!stripeId) return null;

    const rawId = rawStripeId(stripeId, meta);
    if (type === 'payout' && rawId.startsWith('txn_')) return null;

    const amountCents = Number(m.amountCents || 0);
    const feeCents = Math.abs(Number(m.feeCents || 0));
    const netCents = Number(m.netCents ?? amountCents - feeCents);
    const { kind, label } = classifyStripeType(type, amountCents);

    const occurredAt =
        parseIsoDate(m.createdAtStripe) ||
        parseIsoDate(meta.created) ||
        parseIsoDate(meta.created_at);
    if (!occurredAt) return null;

    const accountCode =
        m.accountCode ||
        (str(meta.account) === 'EU' || stripeId.includes('_eu_') ? 'EU' : 'COM');

    const customerName =
        str(m.order?.buyerFullName) ||
        str(meta.customerName) ||
        str(meta.customer_name) ||
        null;
    const customerEmail =
        str(m.order?.buyerEmail) ||
        str(meta.customerEmail) ||
        str(meta.customer_email) ||
        null;
    const orderRef =
        str(m.order?.orderNumber) ||
        str(meta.orderNumber) ||
        str(meta.order_number) ||
        null;

    const description =
        str(m.description) || (orderRef ? `Ordine ${orderRef}` : null) || label;

    const statusRaw = str(m.status);
    const statusLabel =
        !statusRaw ||
        statusRaw === 'available' ||
        statusRaw === 'paid' ||
        statusRaw === 'succeeded'
            ? 'Completato'
            : statusRaw;

    return {
        id: `stripe:${stripeId}`,
        occurredAt,
        gateway: 'stripe',
        accountCode,
        accountLabel: accountCode === 'EU' ? 'Stripe EU' : 'Stripe COM',
        movementKind: kind,
        movementLabel: label,
        description,
        customerName,
        customerEmail,
        reference: orderRef || str(m.sourceId) || null,
        transactionId: rawId || stripeId,
        grossCents: amountCents,
        feeCents,
        netCents,
        currency: (m.currency || 'eur').toUpperCase(),
        statusLabel,
        sourceLabel: 'API Stripe',
        dedupeKey: `stripe:${accountCode}:${rawId || stripeId}:${kind}`,
    };
}

export type PaypalTxInput = {
    id?: string;
    status?: string;
    grossCents?: number;
    feeCents?: number;
    netCents?: number;
    currency?: string;
    transactionDate?: string;
    description?: string;
    payerEmail?: string | null;
    source?: string;
};

export function mapPaypalTxToRow(tx: PaypalTxInput): GatewaySyncRow | null {
    const id = String(tx.id || '').trim();
    if (!id) return null;
    const grossCents = Number(tx.grossCents || 0);
    const feeCents = Math.abs(Number(tx.feeCents || 0));
    const netCents = Number(
        tx.netCents ?? grossCents - (grossCents >= 0 ? feeCents : -feeCents)
    );
    const description = str(tx.description) || `PayPal ${id}`;
    const { kind, label } = classifyPaypal(description, grossCents);
    const occurredAt = parseIsoDate(tx.transactionDate);
    if (!occurredAt) return null;

    const sourceRaw = String(tx.source || '').toLowerCase();
    let sourceLabel: GatewaySourceLabel = 'PayPal';
    if (sourceRaw.includes('csv')) sourceLabel = 'CSV Import';
    else if (sourceRaw.includes('webhook')) sourceLabel = 'Webhook PayPal';
    else if (sourceRaw.includes('api') || sourceRaw.includes('sync')) sourceLabel = 'API PayPal';

    return {
        id: `paypal:${id}`,
        occurredAt,
        gateway: 'paypal',
        accountCode: 'PAYPAL',
        accountLabel: sourceLabel === 'CSV Import' ? 'PayPal CSV' : 'PayPal',
        movementKind: kind,
        movementLabel: label,
        description,
        customerName: null,
        customerEmail: str(tx.payerEmail),
        reference: null,
        transactionId: id,
        grossCents,
        feeCents,
        netCents,
        currency: (tx.currency || 'EUR').toUpperCase(),
        statusLabel:
            !tx.status || /success|completed|^s$|completato/i.test(tx.status)
                ? 'Completato'
                : String(tx.status),
        sourceLabel,
        dedupeKey: `paypal:${id}:${kind}`,
    };
}

export type PaypalLedgerInput = {
    id: string;
    sourceKey: string;
    sourceId: string;
    category: string;
    accountingDate: Date | string;
    description: string;
    counterpartyName?: string | null;
    totalCents: number;
    metadataJson?: unknown;
};

export function mapPaypalLedgerToRow(entry: PaypalLedgerInput): GatewaySyncRow | null {
    const meta = asMeta(entry.metadataJson);
    const sourceKey = entry.sourceKey || '';
    if (!sourceKey.toUpperCase().startsWith('PAYPAL_')) return null;

    const parsed = parsePaypalSourceKey(sourceKey);
    if (parsed?.kind === 'FEE') return null;

    const txId =
        parsed?.transactionId ||
        normalizePaypalTransactionId(entry.sourceId) ||
        normalizePaypalTransactionId(str(meta.paypalTransactionId)) ||
        entry.id;

    let kind: MovementKind = 'incasso';
    let label = 'Incasso Ordine';
    if (parsed?.kind === 'REFUND' || sourceKey.startsWith('PAYPAL_REFUND')) {
        kind = 'rimborso';
        label = 'Rimborso';
    } else if (parsed?.kind === 'PAYOUT' || sourceKey.startsWith('PAYPAL_PAYOUT')) {
        kind = 'payout';
        label = 'Payout Bancario';
    }

    const feeCents = Math.abs(Number(meta.feeCents || 0));
    const totalCents = Number(entry.totalCents || 0);
    const occurredAt =
        parseIsoDate(entry.accountingDate) || parseIsoDate(meta.transactionDate);
    if (!occurredAt) return null;

    let sourceLabel: GatewaySourceLabel = 'PayPal';
    if (meta.csvImport || meta.source === 'csv') sourceLabel = 'CSV Import';
    else if (meta.webhook || meta.source === 'webhook') sourceLabel = 'Webhook PayPal';
    else if (meta.syncedFromApi) sourceLabel = 'API PayPal';

    return {
        id: `paypal-ledger:${entry.id}`,
        occurredAt,
        gateway: 'paypal',
        accountCode: 'PAYPAL',
        accountLabel: sourceLabel === 'CSV Import' ? 'PayPal CSV' : 'PayPal',
        movementKind: kind,
        movementLabel: label,
        description: entry.description || label,
        customerName: str(entry.counterpartyName),
        customerEmail: str(meta.payerEmail),
        reference: str(meta.referenceId),
        transactionId: txId,
        grossCents: totalCents,
        feeCents,
        netCents: totalCents - (totalCents >= 0 ? feeCents : -feeCents),
        currency: 'EUR',
        statusLabel: 'Completato',
        sourceLabel,
        dedupeKey: `paypal:${txId}:${kind}`,
    };
}

export function dedupeGatewayRows(rows: GatewaySyncRow[]): GatewaySyncRow[] {
    const score = (r: GatewaySyncRow) => {
        let s = 0;
        if (r.description) s += 2;
        if (r.customerName || r.customerEmail) s += 3;
        if (r.reference) s += 2;
        if (r.feeCents > 0) s += 1;
        if (r.accountLabel) s += 1;
        if (r.movementLabel) s += 1;
        if (r.sourceLabel === 'Webhook PayPal' || r.sourceLabel === 'CSV Import') s += 1;
        if (r.sourceLabel === 'API Stripe' || r.sourceLabel === 'API PayPal') s += 1;
        return s;
    };

    /** Normalizza ID reale (charge / pi / txn / PayPal) per collassare sync multipli. */
    const normalizeTxId = (id: string, gateway: GatewayKind): string => {
        if (gateway === 'paypal') return normalizePaypalTransactionId(id);
        return id
            .trim()
            .toLowerCase()
            .replace(/^stripe_(eu_)?(tx_)?/, '');
    };

    // 1) Dedup per chiave tipizzata (gateway + ID + tipo movimento)
    const byTypedKey = new Map<string, GatewaySyncRow>();
    for (const row of rows) {
        const prev = byTypedKey.get(row.dedupeKey);
        if (!prev || score(row) > score(prev)) byTypedKey.set(row.dedupeKey, row);
    }

    // 2) Dedup tassativo su ID transazione reale (stesso gateway + stesso ID)
    const byTxId = new Map<string, GatewaySyncRow>();
    for (const row of byTypedKey.values()) {
        const tx = normalizeTxId(row.transactionId || row.id, row.gateway);
        if (!tx) {
            byTxId.set(`fallback:${row.id}`, ensureGatewayBadges(row));
            continue;
        }
        const key = `${row.gateway}:${tx}:${row.movementKind}`;
        const prev = byTxId.get(key);
        const enriched = ensureGatewayBadges(row);
        if (!prev || score(enriched) > score(prev)) byTxId.set(key, enriched);
    }

    const payoutSeen = new Set<string>();
    const out: GatewaySyncRow[] = [];
    for (const r of Array.from(byTxId.values()).sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    )) {
        if (r.gateway === 'stripe' && r.movementKind === 'payout') {
            const day = r.occurredAt.slice(0, 10);
            const pk = `${r.accountCode}:${day}:${r.grossCents}`;
            if (payoutSeen.has(pk)) continue;
            payoutSeen.add(pk);
        }
        out.push(r);
    }
    return out;
}

/** Garantisce badge Gateway/Account e Tipo Movimento su ogni riga. */
export function ensureGatewayBadges(row: GatewaySyncRow): GatewaySyncRow {
    const accountLabel =
        row.accountLabel?.trim() ||
        (row.gateway === 'paypal'
            ? 'PayPal'
            : row.accountCode === 'EU'
              ? 'Stripe EU'
              : 'Stripe COM');

    const movementLabel =
        row.movementLabel?.trim() ||
        (row.movementKind === 'incasso'
            ? 'Incasso Ordine'
            : row.movementKind === 'commissione'
              ? 'Commissione Gateway'
              : row.movementKind === 'payout'
                ? 'Payout Bancario'
                : row.movementKind === 'rimborso'
                  ? 'Rimborso'
                  : row.movementKind === 'riserva'
                    ? 'Riserva'
                    : 'Altro movimento');

    const accountCode =
        row.accountCode ||
        (row.gateway === 'paypal' ? 'PAYPAL' : accountLabel.includes('EU') ? 'EU' : 'COM');

    return {
        ...row,
        accountCode,
        accountLabel,
        movementLabel,
        movementKind: row.movementKind || 'altro',
    };
}

export function buildGatewaySyncRows(input: {
    stripeMovements?: StripeMovementInput[];
    paypalTransactions?: PaypalTxInput[];
    paypalLedgerEntries?: PaypalLedgerInput[];
}): GatewaySyncRow[] {
    const rows: GatewaySyncRow[] = [];
    for (const m of input.stripeMovements || []) {
        const row = mapStripeMovementToRow(m);
        if (row) rows.push(row);
    }
    for (const t of input.paypalTransactions || []) {
        const row = mapPaypalTxToRow(t);
        if (row) rows.push(row);
    }
    for (const e of input.paypalLedgerEntries || []) {
        const row = mapPaypalLedgerToRow(e);
        if (row) rows.push(row);
    }
    return dedupeGatewayRows(rows);
}
