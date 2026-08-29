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

export type ConsolidatedFiscalAttachment = {
    kind: 'FATTURA' | 'SCONTRINO' | 'COMPENSO' | 'RICEVUTA' | 'DOCUMENTO';
    sourceType: string;
    label: string;
    entryId?: string;
    attachmentUrl?: string | null;
};

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
    bankLineId?: string | null;
    description?: string | null;
    counterpartyName?: string | null;
    attachmentUrl?: string | null;
    metadataJson?: unknown;
};

export type ReconciledPaymentGroup<T extends FiscalDedupableEntry = FiscalDedupableEntry> = {
    key: string;
    primary: T;
    members: T[];
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

function isOutflowExpense(r: FiscalDedupableEntry): boolean {
    if (r.direction === 'USCITA') return true;
    if (r.direction === 'ENTRATA') return false;
    return r.totalCents < 0;
}

function isFloristRelatedExpense(r: FiscalDedupableEntry): boolean {
    if (!isOutflowExpense(r)) return false;
    if (r.category === 'COSTI_FIORISTI') return true;
    if (r.sourceType === 'FLORIST_PAYOUT') return true;
    const meta = asMeta(r.metadataJson);
    const docType = String(meta.docType || '').toUpperCase();
    const blob = `${r.description || ''} ${r.counterpartyName || ''} ${meta.source || ''}`.toUpperCase();
    if (/FIORIST|FIORER|COMPENSO|POSA/.test(blob)) return true;
    if (docType === 'SCONTRINO' || docType === 'FATTURA') {
        if (/FIORIST|FIORER|COMPENSO/.test(blob)) return true;
    }
    return false;
}

function bankLineRef(r: FiscalDedupableEntry): string | null {
    if (r.bankLineId?.trim()) return r.bankLineId.trim();
    if (r.sourceType === 'BANK_LINE' && r.sourceId?.trim()) return r.sourceId.trim();
    const meta = asMeta(r.metadataJson);
    for (const k of ['bankMovementId', 'bankLineId', 'matchedStatementLineId'] as const) {
        const v = meta[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
}

/**
 * Chiave di raggruppamento per pagamenti fiorista riconciliati:
 * stesso movimento bancario, ordine+importo, o riferimento ordine FF-*.
 */
export function reconciledPaymentGroupKey(r: FiscalDedupableEntry): string | null {
    if (!isFloristRelatedExpense(r)) return null;
    const abs = Math.abs(r.totalCents);
    if (abs <= 0) return null;

    const bank = bankLineRef(r);
    if (bank) return `RECON:BL:${bank}`;

    const orderRef = (r.orderId || '').trim();
    if (orderRef) return `RECON:ORD:${orderRef}|${abs}`;

    const docRef = (r.documentRef || '').trim();
    if (docRef && /^FF-/i.test(docRef)) return `RECON:DOC:${docRef.toUpperCase()}|${abs}`;

    const day = calendarDayKey(r.accountingDate);
    const cp = (r.counterpartyName || '').trim().toUpperCase();
    if (day && cp) return `RECON:DAY:${day}|${abs}|${cp.slice(0, 48)}`;

    return null;
}

function reconciledPrimaryRank(r: FiscalDedupableEntry): number {
    if (r.sourceType === 'BANK_LINE') return 100;
    if (r.sourceType === 'FLORIST_PAYOUT') return 85;
    if (r.sourceType === 'MANUAL_EXPENSE') {
        const meta = asMeta(r.metadataJson);
        const docType = String(meta.docType || '').toUpperCase();
        if (docType === 'FATTURA') return 65;
        if (docType === 'SCONTRINO') return 62;
        return 60;
    }
    if (r.sourceType === 'JSON_ENTRY') return 20;
    return 50;
}

function pickReconciledPrimary<T extends FiscalDedupableEntry>(members: T[]): T {
    let best = members[0];
    let bestRank = reconciledPrimaryRank(best);
    for (let i = 1; i < members.length; i++) {
        const m = members[i];
        const rank = reconciledPrimaryRank(m);
        if (rank > bestRank) {
            best = m;
            bestRank = rank;
            continue;
        }
        if (rank === bestRank) {
            const idM = m.id || '';
            const idB = best.id || '';
            if (idM && idB && idM < idB) best = m;
        }
    }
    return best;
}

function attachmentFromRow(r: FiscalDedupableEntry): ConsolidatedFiscalAttachment | null {
    const meta = asMeta(r.metadataJson);
    const docType = String(meta.docType || '').toUpperCase();
    let kind: ConsolidatedFiscalAttachment['kind'] = 'DOCUMENTO';
    if (docType === 'FATTURA') kind = 'FATTURA';
    else if (docType === 'SCONTRINO') kind = 'SCONTRINO';
    else if (r.sourceType === 'FLORIST_PAYOUT') kind = 'COMPENSO';
    else if (r.sourceType === 'JSON_ENTRY') kind = 'DOCUMENTO';

    let label = (r.counterpartyName || r.description || r.sourceType || 'Documento').slice(0, 120);
    if (r.sourceType === 'MANUAL_EXPENSE') {
        const vendor = r.counterpartyName || 'fornitore';
        if (docType === 'FATTURA') label = `Fattura ${vendor}`;
        else if (docType === 'SCONTRINO') label = `Scontrino ${vendor}`;
        else label = `Documento ${vendor}`;
    } else if (r.sourceType === 'BANK_LINE') {
        label = 'Bonifico Fineco';
    } else if (r.sourceType === 'JSON_ENTRY') {
        label = (r.description || 'Registrazione manuale').slice(0, 80);
    }

    return {
        kind,
        sourceType: r.sourceType,
        label,
        entryId: r.id,
        attachmentUrl: r.attachmentUrl || null,
    };
}

/** Arricchisce la riga primaria con badge/metadati dei documenti collegati. */
export function enrichPrimaryWithAttachments<T extends FiscalDedupableEntry>(
    primary: T,
    members: T[]
): T {
    const attachments: ConsolidatedFiscalAttachment[] = [];
    const seen = new Set<string>();

    for (const m of members) {
        if (m.id === primary.id) continue;
        const att = attachmentFromRow(m);
        if (!att) continue;
        const dedupeKey = `${att.kind}|${att.label}|${att.sourceType}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        attachments.push(att);
    }

    if (!attachments.length) return primary;

    const meta = asMeta(primary.metadataJson);
    const primaryAtt = primary.attachmentUrl
        ? [attachmentFromRow(primary)].filter(Boolean)
        : [];
    const merged = [...primaryAtt, ...attachments].filter(Boolean) as ConsolidatedFiscalAttachment[];

    return {
        ...primary,
        metadataJson: {
            ...meta,
            consolidatedAttachments: merged,
            reconciledEntryIds: members.map((m) => m.id).filter(Boolean),
        },
    };
}

/** Costruisce gruppi di pagamento riconciliato (≥2 membri = duplicati). */
export function buildReconciledPaymentGroups<T extends FiscalDedupableEntry>(
    rows: T[]
): ReconciledPaymentGroup<T>[] {
    const buckets = new Map<string, T[]>();
    for (const r of rows) {
        const key = reconciledPaymentGroupKey(r);
        if (!key) continue;
        const list = buckets.get(key) || [];
        list.push(r);
        buckets.set(key, list);
    }

    const out: ReconciledPaymentGroup<T>[] = [];
    for (const [key, members] of buckets) {
        if (members.length < 2) continue;
        const primary = pickReconciledPrimary(members);
        out.push({ key, primary, members });
    }
    return out;
}

/**
 * Un movimento bancario riconciliato prevale: documenti fiscali e JSON locali
 * non generano righe contabili separate ma restano come allegati sulla primaria.
 */
export function consolidateReconciledPayments<T extends FiscalDedupableEntry>(rows: T[]): T[] {
    const groups = buildReconciledPaymentGroups(rows);
    if (!groups.length) return rows;

    const suppressIds = new Set<string>();
    const enrichedById = new Map<string, T>();

    for (const group of groups) {
        const enriched = enrichPrimaryWithAttachments(group.primary, group.members);
        if (group.primary.id) enrichedById.set(group.primary.id, enriched);
        for (const m of group.members) {
            if (m.id && m.id !== group.primary.id) suppressIds.add(m.id);
        }
    }

    return rows
        .filter((r) => !r.id || !suppressIds.has(r.id))
        .map((r) => (r.id && enrichedById.has(r.id) ? enrichedById.get(r.id)! : r));
}

/**
 * JSON_ENTRY di uscita che duplicano un pagamento già coperto da banca/documento.
 */
export function excludeJsonExpensesCoveredByReconciledPayment<T extends FiscalDedupableEntry>(
    rows: T[]
): T[] {
    const primaryKeys = new Set<string>();
    for (const r of rows) {
        const key = reconciledPaymentGroupKey(r);
        if (!key) continue;
        if (reconciledPrimaryRank(r) >= 60) primaryKeys.add(key);
    }
    if (!primaryKeys.size) return rows;

    return rows.filter((r) => {
        if (r.sourceType !== 'JSON_ENTRY') return true;
        if (!isOutflowExpense(r)) return true;
        const key = reconciledPaymentGroupKey(r);
        if (key && primaryKeys.has(key)) return false;
        return true;
    });
}

/** Pipeline unica per listati Prima Nota e aggregati PnL. */
export function applyFiscalAuthorityHierarchy<T extends FiscalDedupableEntry>(rows: T[]): T[] {
    const step1 = excludeOrdersCoveredByFiscalAuthority(rows);
    const step2 = excludeJsonRevenuesCoveredByFiscalAuthority(step1);
    const step3 = consolidateReconciledPayments(step2);
    const step4 = excludeJsonExpensesCoveredByReconciledPayment(step3);
    return dedupeByNaturalFiscalKey(step4);
}
