/**
 * Macchina a stati PayPal → Prima Nota.
 * Perché: carta d'appoggio e hold PayPal emettono coppie transito/storno che
 * non sono costi/ricavi; in PN deve restare solo il pagamento commerciale o l'incasso ordine.
 *
 * Non persiste sul ledger: filtra/annota in lettura (PnL + Prima Nota).
 */

import { PAYPAL_FUNDING_LABEL_RE, SAAS_MERCHANT_RE } from '@/lib/financial/paypalClassify';

export type PaypalEventKind =
    | 'FUNDING_TRANSIT'
    | 'COMMERCIAL_PAYMENT'
    | 'TECHNICAL_REVERSAL'
    | 'ORDER_CAPTURE'
    | 'FEE'
    | 'PAYOUT'
    | 'OTHER';

export type PaypalClusterState =
    | 'A_VENDOR_CARD_CLUSTER'
    | 'B_ZERO_SUM'
    | 'B_PARTIAL_REFUND'
    | 'C_ORDER_CAPTURE'
    | 'PASSTHROUGH';

export type PaypalMachineEntry = {
    id?: string;
    sourceType: string;
    sourceId?: string | null;
    sourceKey?: string | null;
    documentRef?: string | null;
    accountingDate?: Date | string | null;
    totalCents: number;
    direction?: string | null;
    category?: string | null;
    description?: string | null;
    counterpartyName?: string | null;
    metadataJson?: unknown;
    orderId?: string | null;
};

export type PaypalClassifiedEvent<T extends PaypalMachineEntry = PaypalMachineEntry> = {
    row: T;
    kind: PaypalEventKind;
    signedCents: number;
    txnId: string;
    parentTxnId: string | null;
};

export type PaypalReducedCluster<T extends PaypalMachineEntry = PaypalMachineEntry> = {
    state: PaypalClusterState;
    kept: T[];
    dropped: T[];
    netCents: number;
};

const FISCAL_EPOCH_MS = Date.parse('2026-01-01T00:00:00.000Z');
const AMOUNT_PAIR_WINDOW_MS = 48 * 60 * 60 * 1000;
const MULTI_QUOTA_WINDOW_MS = 48 * 60 * 60 * 1000;
const VENDOR_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Tolleranza 0,005 € → in centesimi interi è zero. */
const ZERO_SUM_TOLERANCE_CENTS = 0;

const COMPANY_IDENTITY_RE =
    /staff\.floremoria@gmail\.com|@floremoria\.com|\bflore\s*moria\b/i;

/** Prelievo reale verso Fineco / conto aziendale. */
const REAL_BANK_PAYOUT_RE =
    /trasferimento bancario|user initiated withdrawal|general withdrawal|bonifico su conto|payout to bank|denaro raccolto per esborso/i;

const REVERSAL_LABEL_RE =
    /rimborso|refund|storno|reversal|chargeback|hold (?:release|cancellation)|sblocco|rilascio (?:blocco|hold)/i;

const ORDER_CAPTURE_LABEL_RE =
    /express checkout|website payment|pagamento espresso|pagamento del sito|incasso ordine|mobile payment|pagamento mobile/i;

const FUNDING_EVENT_CODES = new Set(['T0300', 'T0301', 'T0302']);
const PAYOUT_EVENT_CODES = new Set(['T0400', 'T0401', 'T0403']);
const ORDER_EVENT_CODES = new Set(['T0006', 'T0007', 'T0011']);
const REVERSAL_EVENT_CODES = new Set(['T1106', 'T1107', 'T1110', 'T1111']);
const SKIP_INTERNAL_CODES = new Set(['T0200', 'T0201', 'T0202', 'T1105', 'T1200', 'T1201']);

const KNOWN_VENDOR_RE =
    /CURSOR|BALLARATE|ORCHIDEA|DONGO|TRANSATEL|UBIGI|GOOGLE|OPENAI|VERCEL|GITHUB|META\s*ADS|FACEBOOK|AWS|TWILIO|FUTURIA|APPLE|ADOBE|NOTION|FIGMA|CANVA|MICROSOFT|ANTHROPIC|CLAUDE/i;

function asMeta(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    return {};
}

function metaString(meta: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const v = meta[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
}

export function paypalSignedCents(row: PaypalMachineEntry): number {
    if (row.direction === 'ENTRATA') return Math.abs(row.totalCents);
    if (row.direction === 'USCITA') return -Math.abs(row.totalCents);
    return row.totalCents;
}

export function paypalAccountingTimeMs(row: PaypalMachineEntry): number {
    const raw = row.accountingDate;
    if (raw instanceof Date) {
        const t = raw.getTime();
        return Number.isNaN(t) ? 0 : t;
    }
    if (typeof raw === 'string' && raw.trim()) {
        const t = Date.parse(raw);
        if (!Number.isNaN(t)) return t;
        const day = raw.match(/^(\d{4}-\d{2}-\d{2})/);
        if (day) return Date.parse(`${day[1]}T12:00:00.000Z`);
    }
    return 0;
}

function normalizeTxnId(raw: string | null | undefined): string {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/^PAYPAL_(TX|FEE|PAYOUT|REFUND)(?::(TX|REFUND))?:/i, '')
        .replace(/^FEE_/, '');
}

function textBlob(row: PaypalMachineEntry): string {
    const meta = asMeta(row.metadataJson);
    return [
        row.description,
        row.counterpartyName,
        meta.typeLabel,
        meta.payerEmail,
        meta.email,
    ]
        .filter((v) => typeof v === 'string')
        .join(' ');
}

function eventCodeOf(row: PaypalMachineEntry): string {
    const meta = asMeta(row.metadataJson);
    return String(meta.eventCode || meta.transaction_event_code || '')
        .trim()
        .toUpperCase();
}

function extractRifFromDescription(description: string | null | undefined): string | null {
    const m = String(description || '').match(/\brif\.?\s*([A-Z0-9]{8,})\b/i);
    return m ? normalizeTxnId(m[1]) : null;
}

export function paypalTxnId(row: PaypalMachineEntry): string {
    const meta = asMeta(row.metadataJson);
    return (
        normalizeTxnId(
            metaString(meta, ['paypalTransactionId', 'transactionId', 'paypal_transaction_id']) ||
                row.documentRef ||
                row.sourceId ||
                ''
        ) || normalizeTxnId(row.sourceKey)
    );
}

export function paypalParentTxnId(row: PaypalMachineEntry): string | null {
    const meta = asMeta(row.metadataJson);
    const fromMeta = metaString(meta, [
        'parentTransactionId',
        'paypal_parent_transaction_id',
        'paypalParentTransactionId',
        'referenceId',
        'paypal_reference_id',
        'referenceTxnId',
        'ReferenceTxnID',
        'ParentTransactionID',
    ]);
    return normalizeTxnId(fromMeta) || extractRifFromDescription(row.description) || null;
}

function isFeeRow(row: PaypalMachineEntry): boolean {
    const key = (row.sourceKey || '').toUpperCase();
    if (key.includes('PAYPAL_FEE:')) return true;
    if (row.category === 'ONERI_BANCARI') return true;
    return /commissione paypal|paypal fee/i.test(row.description || '');
}

function isCompanyIdentity(row: PaypalMachineEntry): boolean {
    return COMPANY_IDENTITY_RE.test(textBlob(row));
}

function looksLikeVendor(row: PaypalMachineEntry): boolean {
    const blob = textBlob(row);
    return SAAS_MERCHANT_RE.test(blob) || KNOWN_VENDOR_RE.test(blob);
}

function isPaypalPlatformName(row: PaypalMachineEntry): boolean {
    const cp = String(row.counterpartyName || '').trim();
    if (COMPANY_IDENTITY_RE.test(cp)) return false;
    if (/^paypal$/i.test(cp)) return true;
    return /paypal\s*\(europe\)|paypal\s+europe/i.test(textBlob(row)) && !looksLikeVendor(row);
}

/** Credito tecnico PayPal (storno commissione / conguaglio) da agganciare al fornitore. */
function isPaypalPlatformCredit(item: Indexed<PaypalMachineEntry>): boolean {
    if (item.signed <= 0) return false;
    if (item.kind === 'ORDER_CAPTURE' || item.kind === 'PAYOUT') return false;
    if (item.kind === 'FEE' || item.kind === 'TECHNICAL_REVERSAL' || item.kind === 'OTHER') {
        return isPaypalPlatformName(item.row) || item.kind === 'FEE';
    }
    return isPaypalPlatformName(item.row);
}

export function isPaypalZeroSumNet(cents: number): boolean {
    return Math.abs(cents) <= ZERO_SUM_TOLERANCE_CENTS;
}

function vendorToken(row: PaypalMachineEntry): string {
    const blob = textBlob(row).toUpperCase();
    const known = blob.match(
        /CURSOR|BALLARATE|ORCHIDEA|DONGO|TRANSATEL|UBIGI|GOOGLE|OPENAI|VERCEL|GITHUB|TWILIO|FUTURIA|APPLE|ADOBE|NOTION|FIGMA|CANVA|MICROSOFT|ANTHROPIC/
    );
    if (known) return known[0];
    const name = String(row.counterpartyName || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
    if (name && !COMPANY_IDENTITY_RE.test(name) && name !== 'PAYPAL') {
        return name.slice(0, 40);
    }
    return '';
}

/**
 * Classificatore eventi riga PayPal (prima del clustering).
 */
export function classifyPaypalEvent(row: PaypalMachineEntry): PaypalEventKind {
    if (row.sourceType !== 'PAYPAL_MOVEMENT') return 'OTHER';
    if (isFeeRow(row)) return 'FEE';

    const code = eventCodeOf(row);
    const blob = textBlob(row);
    const signed = paypalSignedCents(row);
    const isPayoutCategory = row.category === 'PAYPAL_PAYOUT';

    if (code && SKIP_INTERNAL_CODES.has(code)) return 'FUNDING_TRANSIT';
    if (code && FUNDING_EVENT_CODES.has(code)) return 'FUNDING_TRANSIT';
    if (PAYPAL_FUNDING_LABEL_RE.test(blob) && !REAL_BANK_PAYOUT_RE.test(blob)) {
        return signed > 0 ? 'TECHNICAL_REVERSAL' : 'FUNDING_TRANSIT';
    }

    if (
        (code && PAYOUT_EVENT_CODES.has(code)) ||
        (isPayoutCategory && REAL_BANK_PAYOUT_RE.test(blob))
    ) {
        return 'PAYOUT';
    }
    if (isPayoutCategory && isCompanyIdentity(row) && !looksLikeVendor(row)) {
        return signed > 0 ? 'TECHNICAL_REVERSAL' : 'FUNDING_TRANSIT';
    }

    if (code && ORDER_EVENT_CODES.has(code)) return 'ORDER_CAPTURE';
    if (
        signed > 0 &&
        (row.category === 'RICAVI_VENDITE' || Boolean(row.orderId) || ORDER_CAPTURE_LABEL_RE.test(blob)) &&
        !looksLikeVendor(row) &&
        !isCompanyIdentity(row) &&
        !isPaypalPlatformName(row)
    ) {
        return 'ORDER_CAPTURE';
    }

    if (code && REVERSAL_EVENT_CODES.has(code)) return 'TECHNICAL_REVERSAL';
    if (signed > 0 && isPaypalPlatformName(row) && !Boolean(row.orderId)) {
        return 'TECHNICAL_REVERSAL';
    }
    if (signed > 0 && (REVERSAL_LABEL_RE.test(blob) || isCompanyIdentity(row))) {
        // Credito merchant SaaS/fornitore: rimborso commerciale (State B), non incasso cliente
        if (looksLikeVendor(row) || row.category === 'RIMBORSI') return 'TECHNICAL_REVERSAL';
        if (isCompanyIdentity(row)) return 'TECHNICAL_REVERSAL';
    }

    if (signed < 0 && (looksLikeVendor(row) || row.category === 'SPESE_SAAS' || row.category === 'ALTRI_COSTI')) {
        return 'COMMERCIAL_PAYMENT';
    }
    if (signed < 0 && !isCompanyIdentity(row) && !REAL_BANK_PAYOUT_RE.test(blob)) {
        return 'COMMERCIAL_PAYMENT';
    }

    if (signed > 0 && looksLikeVendor(row)) return 'TECHNICAL_REVERSAL';
    return 'OTHER';
}

function linkIdsFor(row: PaypalMachineEntry): string[] {
    const ids = new Set<string>();
    const txn = paypalTxnId(row);
    const parent = paypalParentTxnId(row);
    if (txn) ids.add(txn);
    if (parent) ids.add(parent);
    return [...ids];
}

type Indexed<T extends PaypalMachineEntry> = {
    row: T;
    kind: PaypalEventKind;
    signed: number;
    abs: number;
    ms: number;
    txnId: string;
    parentTxnId: string | null;
};

function indexRow<T extends PaypalMachineEntry>(row: T): Indexed<T> {
    const signed = paypalSignedCents(row);
    return {
        row,
        kind: classifyPaypalEvent(row),
        signed,
        abs: Math.abs(signed),
        ms: paypalAccountingTimeMs(row),
        txnId: paypalTxnId(row),
        parentTxnId: paypalParentTxnId(row),
    };
}

function within(a: number, b: number, windowMs: number): boolean {
    if (!a || !b) return false;
    return Math.abs(a - b) <= windowMs;
}

function annotateKept<T extends PaypalMachineEntry>(
    row: T,
    state: PaypalClusterState,
    extras?: { counterpartyName?: string | null; documentRef?: string | null }
): T {
    const meta = { ...asMeta(row.metadataJson), paypalClusterState: state, paypalReducer: true };
    return {
        ...row,
        counterpartyName: extras?.counterpartyName ?? row.counterpartyName,
        documentRef: extras?.documentRef ?? row.documentRef,
        metadataJson: meta,
    };
}

function commercialDisplayName(item: Indexed<PaypalMachineEntry>): string {
    const cp = (item.row.counterpartyName || '').trim();
    if (cp && !COMPANY_IDENTITY_RE.test(cp) && !/^paypal$/i.test(cp)) return cp;
    const token = vendorToken(item.row);
    return token || cp || 'Fornitore PayPal';
}

function economicNetOf<T extends PaypalMachineEntry>(items: Indexed<T>[]): number {
    return items
        .filter((i) => i.kind !== 'ORDER_CAPTURE' && i.kind !== 'PAYOUT')
        .reduce((s, i) => s + i.signed, 0);
}

function subsetSumCredits<T extends PaypalMachineEntry>(
    credits: Array<{ item: Indexed<T>; index: number }>,
    target: number
): number[] | null {
    if (target <= 0) return null;
    const n = credits.length;
    if (n === 0) return null;
    const exact = credits.find((c) => c.item.signed === target);
    if (exact) return [exact.index];
    const total = credits.reduce((s, c) => s + c.item.signed, 0);
    if (total === target) return credits.map((c) => c.index);
    if (n > 16) return null;

    const amounts = credits.map((c) => c.item.signed);
    const found: number[] = [];
    const dfs = (i: number, left: number): boolean => {
        if (left === 0) return true;
        if (left < 0 || i >= n) return false;
        found.push(credits[i]!.index);
        if (dfs(i + 1, left - amounts[i]!)) return true;
        found.pop();
        return dfs(i + 1, left);
    };
    return dfs(0, target) ? found : null;
}

function collapseToNetPrimary<T extends PaypalMachineEntry>(
    commercials: Indexed<T>[],
    netCents: number,
    state: PaypalClusterState
): T {
    const primary = [...commercials].sort((a, b) => b.abs - a.abs)[0]!;
    const direction: 'ENTRATA' | 'USCITA' = netCents >= 0 ? 'ENTRATA' : 'USCITA';
    return annotateKept(
        {
            ...primary.row,
            totalCents: netCents,
            direction,
            counterpartyName: commercialDisplayName(primary),
            documentRef: primary.txnId || primary.row.documentRef,
            metadataJson: {
                ...asMeta(primary.row.metadataJson),
                paypalCollapsedNetCents: netCents,
                paypalMultiQuota: true,
            },
        },
        state,
        {
            counterpartyName: commercialDisplayName(primary),
            documentRef: primary.txnId || primary.row.documentRef,
        }
    );
}

function reduceCluster<T extends PaypalMachineEntry>(items: Indexed<T>[]): PaypalReducedCluster<T> {
    const fees = items.filter((i) => i.kind === 'FEE');
    const payouts = items.filter((i) => i.kind === 'PAYOUT');
    const captures = items.filter((i) => i.kind === 'ORDER_CAPTURE');
    const commercials = items.filter((i) => i.kind === 'COMMERCIAL_PAYMENT');
    const fundings = items.filter((i) => i.kind === 'FUNDING_TRANSIT');
    const reversals = items.filter((i) => i.kind === 'TECHNICAL_REVERSAL');
    const others = items.filter((i) => i.kind === 'OTHER');
    const netCents = items.reduce((s, i) => s + i.signed, 0);

    const keepPayouts = payouts.map((p) => annotateKept(p.row, 'PASSTHROUGH'));

    // Stato C: incassi cliente — tieni capture + fee collegate.
    if (captures.length && !commercials.length) {
        const keepCaptures = captures.map((i) => annotateKept(i.row, 'C_ORDER_CAPTURE'));
        const keepFees = fees
            .filter((f) => !f.txnId || captures.some((c) => c.txnId === f.txnId))
            .map((i) => annotateKept(i.row, 'C_ORDER_CAPTURE'));
        const dropped = items
            .filter((i) => i.kind === 'FUNDING_TRANSIT' || i.kind === 'TECHNICAL_REVERSAL' || i.kind === 'OTHER')
            .map((i) => i.row);
        return {
            state: 'C_ORDER_CAPTURE',
            kept: [...keepCaptures, ...keepFees, ...keepPayouts],
            dropped,
            netCents: keepCaptures.reduce((s, r) => s + paypalSignedCents(r), 0),
        };
    }

    const economic = items.filter((i) => i.kind !== 'ORDER_CAPTURE' && i.kind !== 'PAYOUT');
    const economicNet = economic.reduce((s, i) => s + i.signed, 0);

    // Stato B multi-quota: somma algebrica ~ 0,00 € → nessuna voce in Prima Nota.
    if (economic.length >= 2 && isPaypalZeroSumNet(economicNet) && !captures.length) {
        return {
            state: 'B_ZERO_SUM',
            kept: keepPayouts,
            dropped: economic.map((i) => i.row),
            netCents: 0,
        };
    }

    // Stato A / B parziale: transito + pagamento + storni spezzati → una sola riga al netto.
    if (commercials.length >= 1 && (fundings.length >= 1 || reversals.length >= 1 || others.length >= 1 || fees.length >= 1)) {
        if (isPaypalZeroSumNet(economicNet)) {
            return {
                state: 'B_ZERO_SUM',
                kept: keepPayouts,
                dropped: economic.map((i) => i.row),
                netCents: 0,
            };
        }

        const collapsed = collapseToNetPrimary(
            commercials,
            economicNet,
            economicNet !== commercials.reduce((s, c) => s + c.signed, 0)
                ? 'B_PARTIAL_REFUND'
                : 'A_VENDOR_CARD_CLUSTER'
        );
        const keepKey = collapsed.id || collapsed.sourceKey || '';
        return {
            state: economicNet !== commercials.reduce((s, c) => s + c.signed, 0)
                ? 'B_PARTIAL_REFUND'
                : 'A_VENDOR_CARD_CLUSTER',
            kept: [collapsed, ...keepPayouts],
            dropped: economic
                .filter((i) => (i.row.id || i.row.sourceKey || '') !== keepKey)
                .map((i) => i.row),
            netCents: economicNet,
        };
    }

    return {
        state: 'PASSTHROUGH',
        kept: items.map((i) => annotateKept(i.row, 'PASSTHROUGH')),
        dropped: [],
        netCents,
    };
}

function unionFind(size: number) {
    const parent = Array.from({ length: size }, (_, i) => i);
    const find = (i: number): number => {
        let p = parent[i]!;
        while (p !== parent[p]) p = parent[p]!;
        parent[i] = p;
        return p;
    };
    const union = (a: number, b: number) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    };
    return { find, union };
}

/**
 * Bundler multi-quota: se un addebito fornitore ha storni spezzati (fornitore + PayPal)
 * nella finestra 48h e la somma algebrica è 0, unisce tutte le quote nello stesso cluster.
 */
function attachMultiQuotaZeroSumCredits<T extends PaypalMachineEntry>(
    items: Indexed<T>[],
    find: (i: number) => number,
    union: (a: number, b: number) => void
): void {
    let changed = true;
    let guard = 0;
    while (changed && guard < items.length + 2) {
        changed = false;
        guard += 1;
        const groups = new Map<number, number[]>();
        items.forEach((_, index) => {
            const root = find(index);
            const list = groups.get(root) || [];
            list.push(index);
            groups.set(root, list);
        });

        for (const indexes of groups.values()) {
            const members = indexes.map((i) => items[i]!);
            if (members.some((m) => m.kind === 'ORDER_CAPTURE' || m.kind === 'PAYOUT')) continue;
            const hasCommercial = members.some((m) => m.kind === 'COMMERCIAL_PAYMENT');
            if (!hasCommercial) continue;
            const net = economicNetOf(members);
            if (isPaypalZeroSumNet(net) || net >= 0) continue;
            const need = -net;

            const candidates: Array<{ item: Indexed<T>; index: number }> = [];
            items.forEach((item, j) => {
                if (indexes.includes(j)) return;
                if (item.kind === 'ORDER_CAPTURE' || item.kind === 'PAYOUT') return;
                if (item.signed <= 0) return;
                const close = members.some((m) => within(m.ms, item.ms, MULTI_QUOTA_WINDOW_MS));
                if (!close) return;
                const token = vendorToken(item.row);
                const sameVendor =
                    Boolean(token) && members.some((m) => vendorToken(m.row) === token);
                if (!sameVendor && !isPaypalPlatformCredit(item)) return;
                candidates.push({ item, index: j });
            });

            const picked = subsetSumCredits(candidates, need);
            if (!picked?.length) continue;
            const root = indexes[0]!;
            for (const idx of picked) union(root, idx);
            changed = true;
        }
    }
}

function clusterIndexed<T extends PaypalMachineEntry>(items: Indexed<T>[]): Indexed<T>[][] {
    if (items.length === 0) return [];
    const { find, union } = unionFind(items.length);

    const idToIndexes = new Map<string, number[]>();
    items.forEach((item, index) => {
        for (const id of linkIdsFor(item.row)) {
            if (!id) continue;
            const list = idToIndexes.get(id) || [];
            list.push(index);
            idToIndexes.set(id, list);
        }
        if (item.txnId && item.parentTxnId && item.txnId !== item.parentTxnId) {
            const parents = idToIndexes.get(item.parentTxnId) || [];
            parents.push(index);
            idToIndexes.set(item.parentTxnId, parents);
        }
    });
    for (const indexes of idToIndexes.values()) {
        for (let i = 1; i < indexes.length; i++) union(indexes[0]!, indexes[i]!);
    }

    // Coppie stesso |importo| in 48h: funding/reversal/commercial complementari.
    for (let i = 0; i < items.length; i++) {
        const a = items[i]!;
        if (a.kind === 'PAYOUT' || a.kind === 'ORDER_CAPTURE') continue;
        if (a.kind === 'FEE' && a.signed < 0) continue;
        for (let j = i + 1; j < items.length; j++) {
            const b = items[j]!;
            if (b.kind === 'PAYOUT' || b.kind === 'ORDER_CAPTURE') continue;
            if (b.kind === 'FEE' && b.signed < 0) continue;
            if (a.abs !== b.abs || a.abs === 0) continue;
            if (!within(a.ms, b.ms, AMOUNT_PAIR_WINDOW_MS)) continue;
            const complementary =
                (a.kind === 'FUNDING_TRANSIT' && (b.kind === 'TECHNICAL_REVERSAL' || b.kind === 'COMMERCIAL_PAYMENT')) ||
                (b.kind === 'FUNDING_TRANSIT' && (a.kind === 'TECHNICAL_REVERSAL' || a.kind === 'COMMERCIAL_PAYMENT')) ||
                (a.kind === 'COMMERCIAL_PAYMENT' && (b.kind === 'TECHNICAL_REVERSAL' || isPaypalPlatformCredit(b))) ||
                (b.kind === 'COMMERCIAL_PAYMENT' && (a.kind === 'TECHNICAL_REVERSAL' || isPaypalPlatformCredit(a)));
            if (complementary) union(i, j);
        }
    }

    // Fornitori (Transatel 4,00 / 0,15 / 3,85): stesso vendor in 7 giorni.
    for (let i = 0; i < items.length; i++) {
        const a = items[i]!;
        const tokenA = vendorToken(a.row);
        if (!tokenA || a.kind === 'PAYOUT' || a.kind === 'ORDER_CAPTURE') continue;
        if (a.kind === 'FEE' && a.signed < 0) continue;
        for (let j = i + 1; j < items.length; j++) {
            const b = items[j]!;
            if (b.kind === 'PAYOUT' || b.kind === 'ORDER_CAPTURE') continue;
            if (b.kind === 'FEE' && b.signed < 0) continue;
            if (!within(a.ms, b.ms, VENDOR_WINDOW_MS)) continue;
            if (vendorToken(b.row) !== tokenA) continue;
            union(i, j);
        }
    }

    attachMultiQuotaZeroSumCredits(items, find, union);

    const buckets = new Map<number, Indexed<T>[]>();
    items.forEach((item, index) => {
        const root = find(index);
        const list = buckets.get(root) || [];
        list.push(item);
        buckets.set(root, list);
    });
    return [...buckets.values()];
}

function isPaypalMovement(row: PaypalMachineEntry): boolean {
    return row.sourceType === 'PAYPAL_MOVEMENT' || (row.sourceKey || '').toUpperCase().startsWith('PAYPAL_');
}

/**
 * Applica il reducer a tutte le scritture PayPal da 01/01/2026.
 * Le altre fonti restano invariate e nell'ordine originale relativo.
 */
export function applyPaypalStateMachine<T extends PaypalMachineEntry>(rows: T[]): T[] {
    const paypalIdx: number[] = [];
    const indexed: Indexed<T>[] = [];

    rows.forEach((row, index) => {
        if (!isPaypalMovement(row)) return;
        if (paypalAccountingTimeMs(row) && paypalAccountingTimeMs(row) < FISCAL_EPOCH_MS) return;
        paypalIdx.push(index);
        indexed.push(indexRow(row));
    });
    if (!indexed.length) return rows;

    const dropped = new Set<string>();
    const replacement = new Map<string, T>();
    const clusters = clusterIndexed(indexed);

    for (const cluster of clusters) {
        const reduced = reduceCluster(cluster);
        for (const d of reduced.dropped) {
            const key = d.id || d.sourceKey || `${paypalTxnId(d)}|${paypalSignedCents(d)}`;
            dropped.add(key);
        }
        for (const k of reduced.kept) {
            const key = k.id || k.sourceKey || `${paypalTxnId(k)}|${paypalSignedCents(k)}`;
            replacement.set(key, k);
        }
    }

    return rows.filter((row, index) => {
        if (!paypalIdx.includes(index)) return true;
        const key = row.id || row.sourceKey || `${paypalTxnId(row)}|${paypalSignedCents(row)}`;
        return !dropped.has(key);
    }).map((row) => {
        const key = row.id || row.sourceKey || `${paypalTxnId(row)}|${paypalSignedCents(row)}`;
        return replacement.get(key) ?? row;
    });
}

export type RunningBalanceRow<T extends PaypalMachineEntry = PaypalMachineEntry> = {
    row: T;
    runningCents: number;
};

/** Saldo progressivo su lista già ridotta, ordine cronologico rigoroso da epoch 2026. */
export function recomputeSequentialRunningBalance<T extends PaypalMachineEntry>(
    rows: T[],
    openingCents = 0
): RunningBalanceRow<T>[] {
    const chronological = [...rows].sort((a, b) => {
        const dt = paypalAccountingTimeMs(a) - paypalAccountingTimeMs(b);
        if (dt !== 0) return dt;
        return String(a.id || a.sourceKey || '').localeCompare(String(b.id || b.sourceKey || ''));
    });
    let running = openingCents;
    return chronological.map((row) => {
        running += paypalSignedCents(row);
        return { row, runningCents: running };
    });
}

export function reducePaypalLedgerForPrimaNota<T extends PaypalMachineEntry>(rows: T[]): T[] {
    return applyPaypalStateMachine(rows);
}
