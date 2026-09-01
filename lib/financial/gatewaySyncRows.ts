/**
 * Unifica e deduplica movimenti Stripe (COM/EU) + PayPal (API/Webhook/CSV)
 * per la tabella "Sincronizzazione API Gateway".
 */

import type { LedgerCategory } from '@/lib/financial/historicalLedgerTypes';
import {
    classifyPaypalGatewayMovement,
    isSaasPaypalDescription,
} from '@/lib/financial/paypalClassify';
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
    orderId?: string | null;
    orderNumber?: string | null;
    /** Charge Stripe (ch_…) per raggruppare fee/climate sulla stessa riga business */
    sourceChargeId?: string | null;
    /** Micro-movimento nascosto in vista semplificata (fee climate, regolazioni) */
    isTechnical?: boolean;
    transactionId: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    statusLabel: string;
    sourceLabel: GatewaySourceLabel;
    dedupeKey: string;
};

export type GatewayEventKind = 'order' | 'payout' | 'refund' | 'expense' | 'technical';

/** Riga business consolidata (1 ordine / 1 payout / 1 rimborso). */
export type GatewaySyncGroupedRow = {
    id: string;
    groupKey: string;
    eventKind: GatewayEventKind;
    occurredAt: string;
    gateway: GatewayKind;
    accountCode: string;
    accountLabel: string;
    movementKind: MovementKind;
    movementLabel: string;
    description: string;
    orderId: string | null;
    orderNumber: string | null;
    customerName: string | null;
    customerEmail: string | null;
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    statusLabel: string;
    sourceLabel: GatewaySourceLabel;
    transactionIds: string[];
    rawRowCount: number;
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

/** Estrae codice ordine FloreMoria (FM-YY-MMDD) da testo libero. */
export function extractFloreOrderNumber(text: string | null | undefined): string | null {
    if (!text) return null;
    const m = text.match(/\b(FM-\d{2,4}-\d{3,6})\b/i);
    return m ? m[1].toUpperCase() : null;
}

function classifyStripeType(type: string, amountCents: number): {
    kind: MovementKind;
    label: string;
    isTechnical?: boolean;
} {
    const t = (type || '').toLowerCase();
    if (t.includes('climate'))
        return { kind: 'commissione', label: 'Contributo Stripe Climate', isTechnical: true };
    if (t === 'charge' || t === 'payment') return { kind: 'incasso', label: 'Incasso Ordine' };
    if (t === 'payment_refund' || t === 'refund' || t === 'refund_failure')
        return { kind: 'rimborso', label: 'Rimborso Cliente' };
    if (t === 'stripe_fee' || t === 'network_cost')
        return { kind: 'commissione', label: 'Commissione Gateway', isTechnical: true };
    if (t === 'payout' || t === 'payout_cancel' || t === 'payout_failure')
        return { kind: 'payout', label: 'Bonifico Payout → Banca' };
    if (t.includes('reserve')) return { kind: 'riserva', label: 'Riserva' };
    if (amountCents < 0 && (t === 'adjustment' || t === 'fee'))
        return { kind: 'commissione', label: 'Regolazione / Fee', isTechnical: true };
    return { kind: 'altro', label: 'Movimento Tecnico' };
}

function classifyPaypal(
    description: string,
    grossCents: number,
    eventCode?: string | null
): {
    kind: MovementKind;
    label: string;
    skip?: boolean;
} {
    const classified = classifyPaypalGatewayMovement({
        description,
        grossCents,
        eventCode,
    });
    if (!classified.record || classified.movementKind === 'skip') {
        return { kind: 'altro', label: classified.label, skip: true };
    }
    return {
        kind: classified.movementKind as MovementKind,
        label: classified.label,
    };
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
    // Evita doppio payout: la riga `txn_*` type=payout è speculare rispetto a `po_*`
    if (type === 'payout' && rawId.startsWith('txn_')) return null;
    // Hold/release minimo saldo: rumore operativo, non movimento commerciale
    if (
        type === 'payout_minimum_balance_hold' ||
        type === 'payout_minimum_balance_release'
    ) {
        return null;
    }

    const amountCents = Number(m.amountCents || 0);
    const feeCents = Math.abs(Number(m.feeCents || 0));
    const netCents = Number(m.netCents ?? amountCents - feeCents);
    const { kind, label, isTechnical } = classifyStripeType(type, amountCents);

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
        extractFloreOrderNumber(str(m.description)) ||
        null;

    const sourceId = str(m.sourceId);
    const metaSource = str(meta.source) || str(meta.charge) || sourceId;
    const sourceChargeId =
        metaSource && (metaSource.startsWith('ch_') || metaSource.startsWith('py_'))
            ? metaSource
            : sourceId && (sourceId.startsWith('ch_') || sourceId.startsWith('py_'))
              ? sourceId
              : rawId.startsWith('ch_') || rawId.startsWith('py_')
                ? rawId
                : null;

    const description =
        orderRef && kind === 'incasso'
            ? `Incasso ordine ${orderRef}`
            : str(m.description) || (orderRef ? `Ordine ${orderRef}` : null) || label;

    // Chiave canonica: charge/po/txn preferendo sourceId/payoutId
    const payoutIdRaw = str(m.payoutId)?.replace(/^stripe_tx_/, '') || null;
    let transactionId = rawId || stripeId;
    if (kind === 'payout') {
        const po =
            (sourceId && sourceId.startsWith('po_') ? sourceId : null) ||
            (payoutIdRaw && payoutIdRaw.startsWith('po_') ? payoutIdRaw : null) ||
            (rawId.startsWith('po_') ? rawId : null);
        if (po) transactionId = po;
    } else if (sourceId && (sourceId.startsWith('ch_') || sourceId.startsWith('py_'))) {
        transactionId = sourceId;
    }

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
        reference: orderRef || sourceId || null,
        orderId: str(m.orderId) || null,
        orderNumber: orderRef,
        sourceChargeId,
        isTechnical: Boolean(isTechnical) || kind === 'commissione',
        transactionId,
        grossCents: amountCents,
        feeCents,
        netCents,
        currency: (m.currency || 'eur').toUpperCase(),
        statusLabel,
        sourceLabel: 'API Stripe',
        dedupeKey: `stripe:${accountCode}:${transactionId}:${kind}`,
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
    eventCode?: string | null;
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
    const { kind, label, skip } = classifyPaypal(description, grossCents, tx.eventCode);
    if (skip) return null;
    const orderNumber = extractFloreOrderNumber(description);
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
        description:
            orderNumber && kind === 'incasso'
                ? `Incasso ordine ${orderNumber}`
                : description,
        customerName: null,
        customerEmail: str(tx.payerEmail),
        reference: orderNumber,
        orderNumber,
        isTechnical: kind === 'commissione',
        transactionId: normalizePaypalTransactionId(id) || id,
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

    const feeCents = Math.abs(Number(meta.feeCents || 0));
    const totalCents = Number(entry.totalCents || 0);
    const eventCode = str(meta.eventCode);

    const gatewayClass = classifyPaypalGatewayMovement({
        description: entry.description || '',
        grossCents: totalCents,
        feeCents,
        eventCode,
        counterpartyName: entry.counterpartyName,
    });
    if (!gatewayClass.record || gatewayClass.movementKind === 'skip') return null;

    let kind: MovementKind = gatewayClass.movementKind as MovementKind;
    let label = gatewayClass.label;
    if (parsed?.kind === 'REFUND' || sourceKey.startsWith('PAYPAL_REFUND')) {
        kind = 'rimborso';
        label = 'Rimborso';
    } else if (parsed?.kind === 'PAYOUT' || sourceKey.startsWith('PAYPAL_PAYOUT')) {
        kind = 'payout';
        label = 'Payout Bancario';
    } else if (totalCents < 0 && kind === 'incasso') {
        const cat = (entry.category || '') as LedgerCategory;
        if (cat === 'SPESE_SAAS' || isSaasPaypalDescription(entry.description, entry.counterpartyName)) {
            kind = 'altro';
            label = 'Spesa SaaS / Carta PayPal';
        } else if (cat === 'RIMBORSI') {
            kind = 'rimborso';
            label = 'Rimborso / Storno';
        } else if (cat === 'ONERI_BANCARI') {
            kind = 'commissione';
            label = 'Commissione PayPal';
        } else {
            kind = 'altro';
            label = 'Uscita PayPal';
        }
    }
    const occurredAt =
        parseIsoDate(entry.accountingDate) || parseIsoDate(meta.transactionDate);
    if (!occurredAt) return null;

    let sourceLabel: GatewaySourceLabel = 'PayPal';
    if (meta.csvImport || meta.source === 'csv') sourceLabel = 'CSV Import';
    else if (meta.webhook || meta.source === 'webhook') sourceLabel = 'Webhook PayPal';
    else if (meta.syncedFromApi) sourceLabel = 'API PayPal';

    const orderNumber =
        extractFloreOrderNumber(entry.description) ||
        extractFloreOrderNumber(str(meta.referenceId)) ||
        extractFloreOrderNumber(str(meta.invoiceId));

    return {
        id: `paypal-ledger:${entry.id}`,
        occurredAt,
        gateway: 'paypal',
        accountCode: 'PAYPAL',
        accountLabel: sourceLabel === 'CSV Import' ? 'PayPal CSV' : 'PayPal',
        movementKind: kind,
        movementLabel: label,
        description:
            orderNumber && kind === 'incasso'
                ? `Incasso ordine ${orderNumber}`
                : entry.description || label,
        customerName: str(entry.counterpartyName),
        customerEmail: str(meta.payerEmail),
        reference: orderNumber || str(meta.referenceId),
        orderNumber,
        isTechnical: false,
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
        if (r.feeCents > 0) s += 4;
        if (r.accountLabel) s += 1;
        if (r.movementLabel) s += 1;
        if (r.sourceLabel === 'Webhook PayPal' || r.sourceLabel === 'CSV Import') s += 1;
        if (r.sourceLabel === 'API Stripe' || r.sourceLabel === 'API PayPal') s += 2;
        if (r.movementKind === 'incasso') s += 2;
        return s;
    };

    /**
     * Chiave canonica: charge_id / txn_id / po_ / PayPal txn — senza movementKind,
     * così Webhook + Sync API + CSV collassano sullo stesso ID.
     */
    const normalizeTxId = (row: GatewaySyncRow): string => {
        let id = (row.transactionId || row.id || '').trim();
        if (!id) return '';
        if (row.gateway === 'paypal') return normalizePaypalTransactionId(id);

        id = id
            .replace(/^stripe_eu_tx_/i, '')
            .replace(/^stripe_tx_/i, '')
            .replace(/^stripe_eu_/i, '')
            .replace(/^stripe_/i, '');

        // Payout: preferisci po_… se presente nell'ID o nel riferimento
        const poFromRef = (row.reference || '').match(/po_[A-Za-z0-9]+/);
        if (row.movementKind === 'payout' || id.startsWith('po_')) {
            const po = id.match(/po_[A-Za-z0-9]+/) || poFromRef;
            if (po) return po[0].toLowerCase();
        }
        const ch = id.match(/ch_[A-Za-z0-9]+/);
        if (ch) return ch[0].toLowerCase();
        const pi = id.match(/pi_[A-Za-z0-9]+/);
        if (pi) return pi[0].toLowerCase();
        const txn = id.match(/txn_[A-Za-z0-9]+/);
        if (txn) return txn[0].toLowerCase();
        return id.toLowerCase();
    };

    // 1) Dedup tipizzato (stessa dedupeKey)
    const byTypedKey = new Map<string, GatewaySyncRow>();
    for (const row of rows) {
        const prev = byTypedKey.get(row.dedupeKey);
        if (!prev || score(row) > score(prev)) byTypedKey.set(row.dedupeKey, row);
    }

    // 2) Dedup tassativo su ID transazione gateway (txn/charge/po) — una riga per ID
    const byTxId = new Map<string, GatewaySyncRow>();
    for (const row of byTypedKey.values()) {
        const tx = normalizeTxId(row);
        if (!tx) {
            byTxId.set(`fallback:${row.id}`, ensureGatewayBadges(row));
            continue;
        }
        // PayPal: una chiave per txn (incasso + fee + ledger)
        const key =
            row.gateway === 'paypal'
                ? `paypal:${normalizePaypalTransactionId(row.transactionId) || tx}`
                : row.movementKind === 'commissione'
                  ? `${row.gateway}:fee:${tx}`
                  : `${row.gateway}:${tx}`;
        const prev = byTxId.get(key);
        const enriched = ensureGatewayBadges(row);
        if (!prev) {
            byTxId.set(key, enriched);
            continue;
        }
        // Merge: tieni il migliore e somma fee se mancanti
        const winner = score(enriched) >= score(prev) ? enriched : prev;
        const loser = winner === enriched ? prev : enriched;
        byTxId.set(key, {
            ...winner,
            feeCents: Math.max(winner.feeCents || 0, loser.feeCents || 0),
            netCents:
                winner.netCents ||
                winner.grossCents -
                    (winner.grossCents >= 0
                        ? Math.max(winner.feeCents || 0, loser.feeCents || 0)
                        : -Math.max(winner.feeCents || 0, loser.feeCents || 0)),
            customerName: winner.customerName || loser.customerName,
            customerEmail: winner.customerEmail || loser.customerEmail,
            reference: winner.reference || loser.reference,
            description:
                (winner.description?.length || 0) >= (loser.description?.length || 0)
                    ? winner.description
                    : loser.description,
        });
    }

    // 3) Abbina fee separate (gateway:fee:TX) alla riga TX padre
    const feeKeys = [...byTxId.keys()].filter((k) => k.includes(':fee:'));
    for (const feeKey of feeKeys) {
        const feeRow = byTxId.get(feeKey);
        if (!feeRow) continue;
        const parentKey = feeKey.replace(':fee:', ':');
        const parent = byTxId.get(parentKey);
        if (parent) {
            const feeCents = Math.max(parent.feeCents || 0, Math.abs(feeRow.feeCents || feeRow.grossCents || 0));
            byTxId.set(parentKey, {
                ...parent,
                feeCents,
                netCents:
                    parent.grossCents -
                    (parent.grossCents >= 0 ? feeCents : -feeCents),
            });
            byTxId.delete(feeKey);
        }
    }

    const payoutSeen = new Set<string>();
    const out: GatewaySyncRow[] = [];
    for (const r of Array.from(byTxId.values()).sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    )) {
        if (r.gateway === 'stripe' && r.movementKind === 'payout') {
            const day = r.occurredAt.slice(0, 10);
            const pk = `${r.accountCode}:${day}:${Math.abs(r.grossCents)}`;
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

    // Fee PayPal (PAYPAL_FEE:txn) → mappa per merge sulle TX
    const paypalFeeByTx = new Map<string, number>();
    for (const e of input.paypalLedgerEntries || []) {
        const parsed = parsePaypalSourceKey(e.sourceKey || '');
        if (parsed?.kind === 'FEE' && parsed.transactionId) {
            const prev = paypalFeeByTx.get(parsed.transactionId) || 0;
            paypalFeeByTx.set(parsed.transactionId, Math.max(prev, Math.abs(e.totalCents || 0)));
        }
    }

    for (const e of input.paypalLedgerEntries || []) {
        const row = mapPaypalLedgerToRow(e);
        if (!row) continue;
        const fee = paypalFeeByTx.get(normalizePaypalTransactionId(row.transactionId));
        if (fee && fee > (row.feeCents || 0)) {
            row.feeCents = fee;
            row.netCents =
                row.grossCents - (row.grossCents >= 0 ? fee : -fee);
        }
        rows.push(row);
    }
    return dedupeGatewayRows(rows);
}

function extractStripeChargeKey(row: GatewaySyncRow): string | null {
    const hay = [row.sourceChargeId, row.transactionId, row.reference, row.description]
        .filter(Boolean)
        .join(' ');
    const ch = hay.match(/ch_[A-Za-z0-9]+/i);
    if (ch) return ch[0].toLowerCase();
    const pi = hay.match(/pi_[A-Za-z0-9]+/i);
    if (pi) return pi[0].toLowerCase();
    return null;
}

function resolveBusinessGroupKey(row: GatewaySyncRow): string {
    if (row.movementKind === 'payout') {
        const po = row.transactionId.match(/po_[A-Za-z0-9]+/i);
        return `payout:${row.gateway}:${row.accountCode}:${(po?.[0] || row.transactionId).toLowerCase()}`;
    }
    if (row.movementKind === 'rimborso') {
        if (row.gateway === 'paypal') {
            return `refund:paypal:${normalizePaypalTransactionId(row.transactionId)}`;
        }
        const ch = extractStripeChargeKey(row);
        return `refund:stripe:${row.accountCode}:${ch || row.transactionId.toLowerCase()}`;
    }
    if (row.orderNumber) return `order:${row.orderNumber.toLowerCase()}`;
    if (row.orderId) return `order-id:${row.orderId}`;
    if (row.gateway === 'paypal') {
        const pp = normalizePaypalTransactionId(row.transactionId);
        if (pp) return `paypal:tx:${pp}`;
    }
    const ch = extractStripeChargeKey(row);
    if (ch) return `stripe:charge:${row.accountCode}:${ch}`;
    return `solo:${row.id}`;
}

function pickBestSourceLabel(rows: GatewaySyncRow[]): GatewaySourceLabel {
    const priority: GatewaySourceLabel[] = [
        'API Stripe',
        'API PayPal',
        'Webhook PayPal',
        'CSV Import',
        'PayPal',
    ];
    for (const p of priority) {
        if (rows.some((r) => r.sourceLabel === p)) return p;
    }
    return rows[0]?.sourceLabel || 'PayPal';
}

function groupedMovementLabel(eventKind: GatewayEventKind, movementKind: MovementKind): string {
    if (eventKind === 'order' || movementKind === 'incasso') return 'Incasso Ordine';
    if (movementKind === 'payout') return 'Bonifico Payout → Banca';
    if (movementKind === 'rimborso') return 'Rimborso Cliente';
    if (eventKind === 'expense') return 'Spesa / Abbonamento PayPal';
    if (eventKind === 'technical') return 'Movimento Tecnico / Regolazione';
    return 'Altro movimento';
}

function mergeGatewayGroup(groupKey: string, rows: GatewaySyncRow[]): GatewaySyncGroupedRow {
    const sorted = [...rows].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
    const primary =
        sorted.find((r) => r.movementKind === 'incasso' && r.grossCents > 0) ||
        sorted.find((r) => r.movementKind === 'payout') ||
        sorted.find((r) => r.movementKind === 'rimborso') ||
        sorted.find((r) => !r.isTechnical) ||
        sorted[0];

    const movementKind = primary.movementKind;
    let eventKind: GatewayEventKind = 'order';
    if (movementKind === 'payout') eventKind = 'payout';
    else if (movementKind === 'rimborso') eventKind = 'refund';
    else if (movementKind === 'altro' && primary.grossCents < 0) eventKind = 'expense';
    else if (
        rows.every(
            (r) => r.isTechnical || r.movementKind === 'commissione' || r.movementKind === 'altro'
        ) &&
        movementKind !== 'incasso'
    )
        eventKind = 'technical';
    else if (movementKind === 'incasso') eventKind = 'order';

    let grossCents = 0;
    let feeCents = 0;

    const incasso = rows.filter((r) => r.movementKind === 'incasso' && r.grossCents > 0);
    if (incasso.length) {
        grossCents = Math.max(...incasso.map((r) => r.grossCents));
    } else if (movementKind === 'payout' || movementKind === 'rimborso') {
        grossCents = primary.grossCents;
    } else {
        grossCents = Math.max(...rows.map((r) => r.grossCents));
    }

    for (const r of rows) {
        if (r.movementKind === 'incasso') {
            feeCents = Math.max(feeCents, r.feeCents || 0);
        } else if (r.isTechnical || r.movementKind === 'commissione') {
            feeCents += Math.abs(r.grossCents || r.feeCents || 0);
        }
    }

    let netCents: number;
    if (movementKind === 'payout' || movementKind === 'rimborso') {
        netCents = rows.reduce((sum, r) => sum + (r.netCents || 0), 0) || primary.netCents;
    } else if (eventKind === 'expense' || (movementKind === 'altro' && primary.grossCents < 0)) {
        netCents = primary.netCents || primary.grossCents;
    } else {
        netCents = grossCents - (grossCents >= 0 ? feeCents : -feeCents);
    }

    const orderNumber =
        rows.map((r) => r.orderNumber).find(Boolean) ||
        rows.map((r) => r.reference).find((r) => r && /^FM-/i.test(r)) ||
        null;
    const orderId = rows.map((r) => r.orderId).find(Boolean) || null;
    const customerName = rows.map((r) => r.customerName).find(Boolean) || null;
    const customerEmail = rows.map((r) => r.customerEmail).find(Boolean) || null;

    const transactionIds = [
        ...new Set(rows.map((r) => r.transactionId).filter(Boolean)),
    ].slice(0, 8);

    let description = primary.description;
    if (eventKind === 'order' && orderNumber) {
        description = `Incasso ordine ${orderNumber}`;
    } else if (eventKind === 'payout') {
        description = `Bonifico Payout ${primary.accountLabel} → Banca FloreMoria`;
    } else if (eventKind === 'refund' && orderNumber) {
        description = `Rimborso ordine ${orderNumber}`;
    }

    return {
        id: `group:${groupKey}`,
        groupKey,
        eventKind,
        occurredAt: primary.occurredAt,
        gateway: primary.gateway,
        accountCode: primary.accountCode,
        accountLabel: primary.accountLabel,
        movementKind,
        movementLabel: groupedMovementLabel(eventKind, movementKind),
        description,
        orderId: orderId || null,
        orderNumber: orderNumber || null,
        customerName,
        customerEmail,
        grossCents,
        feeCents,
        netCents,
        currency: primary.currency,
        statusLabel: primary.statusLabel,
        sourceLabel: pickBestSourceLabel(rows),
        transactionIds,
        rawRowCount: rows.length,
    };
}

/**
 * Raggruppa movimenti deduplicati in eventi business (1 ordine / 1 payout / 1 rimborso).
 */
export function groupGatewaySyncRowsForDisplay(rows: GatewaySyncRow[]): GatewaySyncGroupedRow[] {
    const groups = new Map<string, GatewaySyncRow[]>();

    for (const row of rows) {
        let key = resolveBusinessGroupKey(row);
        if (row.isTechnical && row.sourceChargeId) {
            key = `stripe:charge:${row.accountCode}:${row.sourceChargeId.toLowerCase()}`;
        } else if (row.isTechnical && row.gateway === 'paypal') {
            const pp = normalizePaypalTransactionId(row.transactionId);
            if (pp) key = `paypal:tx:${pp}`;
        }
        const bucket = groups.get(key) || [];
        bucket.push(row);
        groups.set(key, bucket);
    }

    return Array.from(groups.entries())
        .map(([key, bucket]) => mergeGatewayGroup(key, bucket))
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

export function enrichGatewayRowsWithOrders(
    rows: GatewaySyncRow[],
    ordersByNumber: Map<
        string,
        { id: string; orderNumber: string; buyerFullName: string | null; buyerEmail: string | null }
    >
): GatewaySyncRow[] {
    return rows.map((row) => {
        const code =
            row.orderNumber ||
            (row.reference && /^FM-/i.test(row.reference) ? row.reference : null) ||
            extractFloreOrderNumber(row.description);
        if (!code) return row;
        const order = ordersByNumber.get(code.toUpperCase());
        if (!order) return { ...row, orderNumber: code };
        return {
            ...row,
            orderId: row.orderId || order.id,
            orderNumber: order.orderNumber || code,
            customerName: row.customerName || order.buyerFullName,
            customerEmail: row.customerEmail || order.buyerEmail,
            reference: order.orderNumber || code,
        };
    });
}
