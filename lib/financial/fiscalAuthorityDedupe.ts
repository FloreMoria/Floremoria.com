/**
 * Gerarchia di verità fiscale: gateway (Stripe/PayPal) e banca (Fineco)
 * prevalgono su ordini web/manuali per evitare doppio conteggio in Prima Nota / PnL.
 *
 * Copertura ordine ↔ autorità: stesso orderId / metadati gateway, stesso giorno
 * calendario e importo esatto in centesimi.
 */

export const FISCAL_AUTHORITY_SOURCE_TYPES = new Set([
    'BANK_LINE',
    'STRIPE_MOVEMENT',
    'PAYPAL_MOVEMENT',
]);

/** Fonti subordinate: ricavi/registrazioni da ordine ecommerce o manuale. */
export const FISCAL_SUBORDINATE_SOURCE_TYPES = new Set(['ORDER']);

export type FiscalDedupableEntry = {
    id?: string;
    sourceType: string;
    sourceId?: string | null;
    sourceKey?: string | null;
    orderId?: string | null;
    documentRef?: string | null;
    accountingDate?: Date | string | null;
    totalCents: number;
    direction?: string | null;
    category?: string | null;
    metadataJson?: unknown;
};

function calendarDayKey(input?: Date | string | null): string {
    if (input == null || input === '') return '';
    if (input instanceof Date) {
        if (Number.isNaN(input.getTime())) return '';
        const y = input.getUTCFullYear();
        const m = String(input.getUTCMonth() + 1).padStart(2, '0');
        const d = String(input.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const raw = String(input).trim();
    const isoDay = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDay) return isoDay[1];
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return calendarDayKey(d);
}

function asMeta(meta: unknown): Record<string, unknown> {
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
        return meta as Record<string, unknown>;
    }
    return {};
}

function collectGatewayTokens(r: FiscalDedupableEntry): string[] {
    const out: string[] = [];
    const push = (v: unknown) => {
        if (typeof v === 'string' && v.trim()) out.push(v.trim());
    };
    push(r.sourceId);
    push(r.documentRef);
    push(r.orderId);
    const meta = asMeta(r.metadataJson);
    push(meta.stripeTransactionId);
    push(meta.stripeId);
    push(meta.paypalTransactionId);
    push(meta.transactionId);
    push(meta.chargeId);
    push(meta.paymentId);
    return out;
}

function isRevenueLike(r: FiscalDedupableEntry): boolean {
    if (r.direction === 'ENTRATA') return true;
    if (r.direction === 'USCITA') return false;
    return r.totalCents > 0;
}

/**
 * True se l'entry autorità può coprire un ricavo ordine (stesso evento economico).
 */
function isAuthorityRevenue(r: FiscalDedupableEntry): boolean {
    if (!FISCAL_AUTHORITY_SOURCE_TYPES.has(r.sourceType)) return false;
    if (!isRevenueLike(r)) return false;
    // Commissioni Stripe/PayPal restano costi: non sono autorità sui ricavi ordine
    if (r.category === 'ONERI_BANCARI') return false;
    const key = (r.sourceKey || '').toUpperCase();
    if (key.includes('_FEE:') || key.startsWith('STRIPE_FEE:') || key.startsWith('PAYPAL_FEE:')) {
        return false;
    }
    return true;
}

function isSubordinateOrderRevenue(r: FiscalDedupableEntry): boolean {
    if (!FISCAL_SUBORDINATE_SOURCE_TYPES.has(r.sourceType)) return false;
    return isRevenueLike(r);
}

/**
 * Esclude scritture ORDER già coperte da banca/gateway (stesso orderId, oppure
 * stesso giorno + importo esatto, oppure token metadati gateway in comune).
 */
export function excludeOrdersCoveredByFiscalAuthority<T extends FiscalDedupableEntry>(
    rows: T[]
): T[] {
    const authorities = rows.filter(isAuthorityRevenue);
    if (authorities.length === 0) return rows;

    const orderIds = new Set<string>();
    const dayAmount = new Set<string>();
    const gatewayTokens = new Set<string>();

    for (const a of authorities) {
        if (a.orderId) orderIds.add(a.orderId);
        if (a.sourceType === 'ORDER' && a.sourceId) orderIds.add(a.sourceId);
        const day = calendarDayKey(a.accountingDate);
        if (day) {
            dayAmount.add(`${day}|${Math.abs(a.totalCents)}`);
        }
        for (const t of collectGatewayTokens(a)) {
            gatewayTokens.add(t);
        }
    }

    return rows.filter((r) => {
        if (!isSubordinateOrderRevenue(r)) return true;

        const orderRef = r.orderId || (r.sourceType === 'ORDER' ? r.sourceId : null);
        if (orderRef && orderIds.has(orderRef)) return false;

        const day = calendarDayKey(r.accountingDate);
        if (day && dayAmount.has(`${day}|${Math.abs(r.totalCents)}`)) return false;

        for (const t of collectGatewayTokens(r)) {
            if (gatewayTokens.has(t) && t !== orderRef) return false;
        }

        return true;
    });
}

/**
 * Anche JSON_ENTRY locali di ricavo che duplicano giorno+importo di un'autorità
 * (ordini inseriti a mano in Prima Nota già riflessi da Fineco/gateway).
 */
export function excludeJsonRevenuesCoveredByFiscalAuthority<T extends FiscalDedupableEntry>(
    rows: T[]
): T[] {
    const authorities = rows.filter(isAuthorityRevenue);
    if (authorities.length === 0) return rows;

    const dayAmount = new Set<string>();
    for (const a of authorities) {
        const day = calendarDayKey(a.accountingDate);
        if (day) dayAmount.add(`${day}|${Math.abs(a.totalCents)}`);
    }

    return rows.filter((r) => {
        if (r.sourceType !== 'JSON_ENTRY') return true;
        if (!isRevenueLike(r)) return true;
        const day = calendarDayKey(r.accountingDate);
        if (day && dayAmount.has(`${day}|${Math.abs(r.totalCents)}`)) return false;
        return true;
    });
}

/**
 * Chiave naturale per dedup UI/listati: sourceKey stabile, altrimenti
 * ordine / payout / documento + categoria + importo assoluto.
 */
export function naturalFiscalKey(r: FiscalDedupableEntry): string {
    const sk = (r.sourceKey || '').trim().toUpperCase();
    if (sk) return `SK:${sk}`;

    const meta = asMeta(r.metadataJson);
    const payout =
        (typeof meta.payoutId === 'string' && meta.payoutId) ||
        (typeof meta.stripePayoutId === 'string' && meta.stripePayoutId) ||
        '';
    if (payout) return `PAYOUT:${payout.toUpperCase()}|${Math.abs(r.totalCents)}`;

    const doc = (r.documentRef || '').trim().toUpperCase();
    if (doc) {
        return `DOC:${doc}|${(r.category || '').toUpperCase()}|${Math.abs(r.totalCents)}`;
    }

    const orderRef = (r.orderId || (r.sourceType === 'ORDER' ? r.sourceId : '') || '')
        .toString()
        .trim();
    if (orderRef) {
        return `ORD:${orderRef}|${(r.category || '').toUpperCase()}|${r.direction || ''}|${Math.abs(r.totalCents)}`;
    }

    const sid = (r.sourceId || '').trim().toUpperCase();
    if (sid) return `SRC:${r.sourceType.toUpperCase()}:${sid}`;

    return `ID:${r.id || ''}|${calendarDayKey(r.accountingDate)}|${Math.abs(r.totalCents)}`;
}

function authorityRank(r: FiscalDedupableEntry): number {
    if (FISCAL_AUTHORITY_SOURCE_TYPES.has(r.sourceType)) return 100;
    if (r.sourceType === 'BANK_LINE') return 100;
    if (r.sourceType.startsWith('STRIPE') || r.sourceType.startsWith('PAYPAL')) return 90;
    if (r.sourceType === 'FLORIST_PAYOUT' || r.sourceType === 'MANUAL_EXPENSE') return 70;
    if (r.sourceType === 'ORDER') return 40;
    if (r.sourceType === 'JSON_ENTRY') return 20;
    return 50;
}

/**
 * Collassa duplicati con la stessa chiave naturale (stesso ordine, payout o documento).
 * Mantiene la scrittura con autorità fiscale più alta.
 */
export function dedupeByNaturalFiscalKey<T extends FiscalDedupableEntry>(rows: T[]): T[] {
    const best = new Map<string, T>();
    for (const r of rows) {
        const key = naturalFiscalKey(r);
        const prev = best.get(key);
        if (!prev) {
            best.set(key, r);
            continue;
        }
        const rankNew = authorityRank(r);
        const rankPrev = authorityRank(prev);
        if (rankNew > rankPrev) {
            best.set(key, r);
            continue;
        }
        if (rankNew === rankPrev) {
            // Stessa autorità: preferisci id lessicografico stabile (determinismo)
            const idNew = r.id || '';
            const idPrev = prev.id || '';
            if (idNew && idPrev && idNew < idPrev) best.set(key, r);
        }
    }
    return Array.from(best.values());
}

/** Pipeline unica per listati Prima Nota e aggregati PnL. */
export function applyFiscalAuthorityHierarchy<T extends FiscalDedupableEntry>(rows: T[]): T[] {
    return dedupeByNaturalFiscalKey(
        excludeJsonRevenuesCoveredByFiscalAuthority(excludeOrdersCoveredByFiscalAuthority(rows))
    );
}
