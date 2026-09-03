/**
 * Gerarchia di verità fiscale: gateway (Stripe/PayPal) e banca (Fineco)
 * prevalgono su ordini web/manuali per evitare doppio conteggio in Prima Nota / PnL.
 *
 * Copertura ordine ↔ autorità: stesso orderId / metadati gateway, stesso giorno
 * calendario e importo esatto in centesimi.
 */

import { extractBareFinecoTrn } from '@/lib/financial/bankStatements/parseFinecoPaste';
import { applyPaypalStateMachine } from '@/lib/accounting/paypalStateMachine';

export const FISCAL_AUTHORITY_SOURCE_TYPES = new Set([
    'BANK_LINE',
    'BANK_LINE_MANUAL',
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
    const movement = canonicalMovementDedupeKey(r);
    if (movement) return movement;

    const sk = (r.sourceKey || '').trim().toUpperCase();
    // BANK_LINE e BANK_LINE_MANUAL sullo stesso id non devono restare doppi via sourceKey diverso
    if (sk.startsWith('BANK_LINE:') || sk.startsWith('BANK_LINE_MANUAL:')) {
        const sid = (r.sourceId || r.bankLineId || '').trim();
        if (sid) return `MOV:BL:${sid}`;
    }
    if (sk) return `SK:${sk}`;

    const supplier = supplierInvoiceDedupeKey(r);
    if (supplier) return supplier;

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
    if (r.sourceType === 'BANK_LINE' || r.sourceType === 'BANK_LINE_MANUAL') return 100;
    if (FISCAL_AUTHORITY_SOURCE_TYPES.has(r.sourceType)) return 100;
    if (r.sourceType.startsWith('STRIPE') || r.sourceType.startsWith('PAYPAL')) return 90;
    if (r.sourceType === 'MANUAL_EXPENSE') return 75;
    if (r.sourceType === 'FLORIST_PAYOUT') return 70;
    if (r.sourceType === 'ORDER') return 40;
    if (r.sourceType === 'JSON_ENTRY') return 20;
    return 50;
}

function normalizeVendorToken(raw: string): string {
    return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\b(S\.?R\.?L\.?|S\.?P\.?A\.?|S\.?A\.?S\.?|SNC|DI|DELL[AE]|E|&)\b/g, ' ')
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 48);
}

function extractInvoiceNumberFromEntry(r: FiscalDedupableEntry): string | null {
    const meta = asMeta(r.metadataJson);
    for (const k of ['invoiceNumber', 'documentNumber', 'invoiceRef'] as const) {
        const v = meta[k];
        if (typeof v === 'string' && v.trim() && /\d/.test(v)) return v.trim().toUpperCase();
    }
    const doc = (r.documentRef || '').trim();
    // documentRef numerico / fattura (non id bank line / cuid)
    if (
        doc &&
        /\d/.test(doc) &&
        /^[A-Z0-9][A-Z0-9./-]{0,24}$/i.test(doc) &&
        !/^c[a-z0-9]{20,}$/i.test(doc)
    ) {
        return doc.toUpperCase();
    }
    const blob = r.description || '';
    // Richiede almeno una cifra: evita falsi positivi tipo "Ins:" / "P. Iban"
    const m =
        blob.match(/\bfattura\s+(?:sdi|report)?\s*.{0,80}?\bn[°º.]?\s*([0-9][A-Z0-9./-]{0,20})\b/i) ||
        blob.match(/\bn[°º.]\s*([0-9][A-Z0-9./-]{0,20})\b/i);
    return m?.[1] ? m[1].toUpperCase() : null;
}

function extractVendorFromEntry(r: FiscalDedupableEntry): string {
    if (r.counterpartyName?.trim()) return normalizeVendorToken(r.counterpartyName);
    const blob = r.description || '';
    const beneficiary =
        blob.match(/Beneficiario\s*:\s*([^|\n]+?)(?:\s+IBAN\b|\s+I\s*BAN\b|\s+Data\b|$)/i)?.[1] ||
        blob.match(/\bBen\s*:\s*([^|\n]+?)(?:\s+Ins\b|\s+IBAN\b|\s+Iban\b|$)/i)?.[1];
    if (beneficiary) return normalizeVendorToken(beneficiary);
    const m =
        blob.match(/fattura\s+(?:sdi|report)?\s*(.+?)\s+n\./i) ||
        blob.match(/fattura\s+n\.\s*\S+\s*[—\-]\s*(.+)$/i);
    if (m?.[1]) return normalizeVendorToken(m[1]);
    return normalizeVendorToken(blob.slice(0, 80));
}

/** Collega JSON `entry_sdi_<expenseId>` / `entry_manual_exp_<expenseId>` alla MANUAL_EXPENSE. */
function linkedManualExpenseId(r: FiscalDedupableEntry): string | null {
    const sid = (r.sourceId || '').trim();
    if (r.sourceType === 'MANUAL_EXPENSE' && sid) return sid;
    const m =
        sid.match(/^entry_sdi_([a-z0-9]+)(?::v\d+)?$/i) ||
        sid.match(/^entry_manual_exp_([a-z0-9]+)$/i);
    if (m?.[1]) return m[1];
    const meta = asMeta(r.metadataJson);
    for (const k of ['manualExpenseId', 'expenseId', 'linkedExpenseId'] as const) {
        const v = meta[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    const doc = (r.documentRef || '').trim();
    if (doc && /^c[a-z0-9]{20,}$/i.test(doc)) {
        // Evita di trattare documentRef=bankLineId come id spesa
        if (doc === sid || doc === (r.bankLineId || '').trim()) return null;
        return doc;
    }
    return null;
}

/**
 * Chiave tassativa per TRN / sourceId / bankLine: un solo movimento economico.
 */
export function canonicalMovementDedupeKey(r: FiscalDedupableEntry): string | null {
    const abs = Math.abs(r.totalCents);
    const bank = bankLineRef(r);
    if (bank) return `MOV:BL:${bank}`;

    const trn = extractBareFinecoTrn(r.description || '');
    if (trn) return `MOV:TRN:${trn}|${abs}`;

    const expenseId = linkedManualExpenseId(r);
    if (expenseId && isOutflowExpense(r)) return `MOV:EXP:${expenseId}|${abs}`;

    const sid = (r.sourceId || '').trim();
    if (sid && (r.sourceType.startsWith('BANK_LINE') || r.sourceType.startsWith('STRIPE') || r.sourceType.startsWith('PAYPAL'))) {
        return `MOV:SID:${sid}`;
    }
    return null;
}

/**
 * Stesso TRN / bankLineId / sourceId banca: una sola riga (autorità più alta).
 */
export function dedupeByCanonicalMovementKey<T extends FiscalDedupableEntry>(rows: T[]): T[] {
    const best = new Map<string, T>();
    const passthrough: T[] = [];
    for (const r of rows) {
        const key = canonicalMovementDedupeKey(r);
        if (!key) {
            passthrough.push(r);
            continue;
        }
        const prev = best.get(key);
        if (!prev) {
            best.set(key, r);
            continue;
        }
        const rankNew = authorityRank(r);
        const rankPrev = authorityRank(prev);
        if (rankNew > rankPrev) best.set(key, r);
        else if (rankNew === rankPrev) {
            const idNew = r.id || '';
            const idPrev = prev.id || '';
            if (idNew && idPrev && idNew < idPrev) best.set(key, r);
        }
    }
    return [...passthrough, ...best.values()];
}

/**
 * Chiave fattura fornitore: stesso fornitore + n. fattura + importo → una spesa.
 * I bonifici collegati via expenseId ereditano la stessa chiave INV.
 */
export function supplierInvoiceDedupeKey(
    r: FiscalDedupableEntry,
    expenseIdToInvKey?: Map<string, string>
): string | null {
    if (!isOutflowExpense(r)) return null;
    if (r.sourceType === 'FLORIST_PAYOUT' && r.orderId) return null;

    const abs = Math.abs(r.totalCents);
    const expenseId = linkedManualExpenseId(r);

    const inv = extractInvoiceNumberFromEntry(r);
    const vendor = extractVendorFromEntry(r);
    const blob = `${r.description || ''} ${r.sourceType}`.toUpperCase();
    const looksLikeInvoice =
        r.sourceType === 'MANUAL_EXPENSE' ||
        r.sourceType === 'JSON_ENTRY' ||
        /FATTURA|SDI|REPORT|NOTA\s*CREDITO|\bNC\b/.test(blob) ||
        Boolean(asMeta(r.metadataJson).invoiceNumber);

    if (inv && vendor && vendor.length >= 3 && looksLikeInvoice) {
        return `SUP:INV:${vendor}|${inv}|${abs}`;
    }

    if (expenseId && expenseIdToInvKey?.has(expenseId)) {
        return expenseIdToInvKey.get(expenseId)!;
    }

    if (expenseId) return `SUP:EXP:${expenseId}|${abs}`;

    return null;
}

/**
 * Collassa Fattura SDI + Fattura report + Registrazione manuale (+ bonifico se collegato).
 */
export function dedupeSupplierInvoices<T extends FiscalDedupableEntry>(rows: T[]): T[] {
    const expenseIdToInvKey = new Map<string, string>();
    for (const r of rows) {
        if (!isOutflowExpense(r)) continue;
        const inv = extractInvoiceNumberFromEntry(r);
        const vendor = extractVendorFromEntry(r);
        const expenseId = linkedManualExpenseId(r);
        if (!inv || !vendor || vendor.length < 3 || !expenseId) continue;
        const blob = `${r.description || ''} ${r.sourceType}`.toUpperCase();
        const looksLikeInvoice =
            r.sourceType === 'MANUAL_EXPENSE' ||
            r.sourceType === 'JSON_ENTRY' ||
            /FATTURA|SDI|REPORT/.test(blob);
        if (!looksLikeInvoice) continue;
        expenseIdToInvKey.set(expenseId, `SUP:INV:${vendor}|${inv}|${Math.abs(r.totalCents)}`);
    }

    // Indice vendor|importo → chiave INV (solo se univoca: evita collasso di bonifici multipli)
    const vendorAmountToInv = new Map<string, string>();
    const vendorAmountAmbiguous = new Set<string>();
    for (const key of expenseIdToInvKey.values()) {
        const m = key.match(/^SUP:INV:(.+)\|([^|]+)\|(\d+)$/);
        if (!m) continue;
        const va = `${m[1]}|${m[3]}`;
        if (vendorAmountToInv.has(va) && vendorAmountToInv.get(va) !== key) {
            vendorAmountAmbiguous.add(va);
        } else {
            vendorAmountToInv.set(va, key);
        }
    }
    for (const va of vendorAmountAmbiguous) vendorAmountToInv.delete(va);

    const best = new Map<string, T>();
    const passthrough: T[] = [];
    for (const r of rows) {
        let key = supplierInvoiceDedupeKey(r, expenseIdToInvKey);
        if (
            !key &&
            isOutflowExpense(r) &&
            (r.sourceType === 'BANK_LINE' || r.sourceType === 'BANK_LINE_MANUAL')
        ) {
            const vendor = extractVendorFromEntry(r);
            const va = `${vendor}|${Math.abs(r.totalCents)}`;
            if (vendor.length >= 3 && vendorAmountToInv.has(va)) {
                key = vendorAmountToInv.get(va)!;
            }
        }
        if (!key) {
            passthrough.push(r);
            continue;
        }
        const prev = best.get(key);
        if (!prev) {
            best.set(key, r);
            continue;
        }
        const rankNew = authorityRank(r);
        const rankPrev = authorityRank(prev);
        if (rankNew > rankPrev) best.set(key, r);
        else if (rankNew === rankPrev) {
            const idNew = r.id || '';
            const idPrev = prev.id || '';
            if (idNew && idPrev && idNew < idPrev) best.set(key, r);
        }
    }
    return [...passthrough, ...best.values()];
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

/** Riferimento ordine FF/FT/FA/FP o orderId. */
export function extractOrderBusinessRef(r: FiscalDedupableEntry): string | null {
    if (r.orderId?.trim()) return `ID:${r.orderId.trim()}`;
    const blob = `${r.documentRef || ''} ${r.description || ''} ${JSON.stringify(asMeta(r.metadataJson))}`;
    const m = blob.match(/\b((?:FF|FT|FA|FP)-[A-Z]{2}-\d{2}-\d{3,})\b/i);
    if (m?.[1]) return `NUM:${m[1].toUpperCase()}`;
    if (r.sourceType === 'ORDER' && r.sourceId?.trim()) return `ID:${r.sourceId.trim()}`;
    if (r.sourceType === 'FLORIST_PAYOUT' && r.sourceId?.trim()) return `ID:${r.sourceId.trim()}`;
    return null;
}

function significantVendorTokens(raw: string): Set<string> {
    const stop = new Set([
        'SRL',
        'SPA',
        'SAS',
        'SNC',
        'DI',
        'DELLA',
        'DELLE',
        'DEI',
        'DEGLI',
        'E',
        'BEN',
        'BENEFICIARIO',
        'IBAN',
        'DATA',
        'INSERIMENTO',
        'SCONTRINO',
        'FATTURA',
        'RICEVUTA',
        'COLLEGAMENTO',
        'MANUALE',
        'PAGAMENTO',
        'ORDINE',
        'FIORERIA',
        'FIORISTA',
    ]);
    const tokens = normalizeVendorToken(raw)
        .split(/\s+/)
        .filter((t) => t.length >= 4 && !stop.has(t));
    return new Set(tokens);
}

function vendorsOverlap(a: string, b: string): boolean {
    const ta = significantVendorTokens(a);
    const tb = significantVendorTokens(b);
    if (!ta.size || !tb.size) return false;
    for (const t of ta) if (tb.has(t)) return true;
    return false;
}

function expenseVendorBlob(r: FiscalDedupableEntry): string {
    return `${r.counterpartyName || ''} ${r.description || ''}`;
}

/**
 * Uscita documentale / fiorista / scontrino: candidata al collasso su bonifico reale.
 */
function isDocumentOrFloristOutflow(r: FiscalDedupableEntry): boolean {
    if (!isOutflowExpense(r)) return false;
    if (r.category === 'COSTI_FIORISTI') return true;
    if (r.sourceType === 'FLORIST_PAYOUT' || r.sourceType === 'MANUAL_EXPENSE') return true;
    if (r.sourceType === 'BANK_LINE' || r.sourceType === 'BANK_LINE_MANUAL') return true;
    const meta = asMeta(r.metadataJson);
    const docType = String(meta.docType || meta.docKind || '').toUpperCase();
    if (docType === 'SCONTRINO' || docType === 'FATTURA' || docType === 'RICEVUTA') return true;
    const blob = `${r.description || ''} ${r.counterpartyName || ''} ${r.sourceId || ''}`.toUpperCase();
    if (/FIORIST|FIORER|COMPENSO|POSA|SCONTRINO|FATTURA\s+RICEVUTA|ENTRY_MANUAL_EXP_/.test(blob)) {
        return true;
    }
    return false;
}

function isFloristRelatedExpense(r: FiscalDedupableEntry): boolean {
    return isDocumentOrFloristOutflow(r);
}

function bankLineRef(r: FiscalDedupableEntry): string | null {
    if (r.bankLineId?.trim()) return r.bankLineId.trim();
    if (
        (r.sourceType === 'BANK_LINE' || r.sourceType === 'BANK_LINE_MANUAL') &&
        r.sourceId?.trim()
    ) {
        return r.sourceId.trim();
    }
    const meta = asMeta(r.metadataJson);
    for (const k of ['bankMovementId', 'bankLineId', 'matchedStatementLineId'] as const) {
        const v = meta[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
}

/**
 * Chiavi di cluster per unione multi-ancora (banca / TRN / ordine / spesa / vendor+importo).
 */
export function authorityOutflowClusterKeys(r: FiscalDedupableEntry): string[] {
    if (!isDocumentOrFloristOutflow(r)) return [];
    const abs = Math.abs(r.totalCents);
    if (abs <= 0) return [];

    const keys: string[] = [];
    const bank = bankLineRef(r);
    if (bank) keys.push(`BL:${bank}`);

    const trn = extractBareFinecoTrn(r.description || '');
    if (trn) keys.push(`TRN:${trn}`);

    const orderRef = extractOrderBusinessRef(r);
    if (orderRef) keys.push(`ORD:${orderRef}|${abs}`);

    const expenseId = linkedManualExpenseId(r);
    if (expenseId) keys.push(`EXP:${expenseId}|${abs}`);

    // Chiave vendor debole: usata solo in union-find con overlap token (vedi consolidate)
    keys.push(`AMT:${abs}`);

    return keys;
}

/**
 * Chiave di raggruppamento per pagamenti fiorista riconciliati:
 * stesso movimento bancario, ordine+importo, o riferimento ordine FF-*.
 */
export function reconciledPaymentGroupKey(r: FiscalDedupableEntry): string | null {
    if (!isDocumentOrFloristOutflow(r)) return null;
    const abs = Math.abs(r.totalCents);
    if (abs <= 0) return null;

    const bank = bankLineRef(r);
    if (bank) return `RECON:BL:${bank}`;

    const trn = extractBareFinecoTrn(r.description || '');
    if (trn) return `RECON:TRN:${trn}`;

    const orderRef = extractOrderBusinessRef(r);
    if (orderRef) return `RECON:ORD:${orderRef}|${abs}`;

    const expenseId = linkedManualExpenseId(r);
    if (expenseId) return `RECON:EXP:${expenseId}|${abs}`;

    const docRef = (r.documentRef || '').trim();
    if (docRef && /^(FF|FT|FA|FP)-/i.test(docRef)) {
        return `RECON:DOC:${docRef.toUpperCase()}|${abs}`;
    }

    return null;
}

function reconciledPrimaryRank(r: FiscalDedupableEntry): number {
    if (r.sourceType === 'BANK_LINE' || r.sourceType === 'BANK_LINE_MANUAL') return 100;
    if (r.sourceType.startsWith('STRIPE') || r.sourceType.startsWith('PAYPAL')) return 95;
    if (r.sourceType === 'FLORIST_PAYOUT') return 50;
    if (r.sourceType === 'MANUAL_EXPENSE') {
        const meta = asMeta(r.metadataJson);
        const docType = String(meta.docType || '').toUpperCase();
        if (docType === 'FATTURA') return 65;
        if (docType === 'SCONTRINO') return 40;
        return 45;
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
    const docType = String(meta.docType || meta.docKind || '').toUpperCase();
    const desc = (r.description || '').toUpperCase();
    let kind: ConsolidatedFiscalAttachment['kind'] = 'DOCUMENTO';
    if (docType === 'FATTURA' || /FATTURA/.test(desc)) kind = 'FATTURA';
    else if (docType === 'SCONTRINO' || /SCONTRINO/.test(desc)) kind = 'SCONTRINO';
    else if (r.sourceType === 'FLORIST_PAYOUT') kind = 'COMPENSO';
    else if (r.sourceType === 'JSON_ENTRY') kind = 'DOCUMENTO';

    let label = (r.counterpartyName || r.description || r.sourceType || 'Documento').slice(0, 120);
    if (r.sourceType === 'MANUAL_EXPENSE' || /SCONTRINO|FATTURA/.test(desc)) {
        const vendor = r.counterpartyName || 'fornitore';
        if (kind === 'FATTURA') label = `Fattura ${vendor}`;
        else if (kind === 'SCONTRINO') label = `Scontrino ${vendor}`;
        else label = `Documento ${vendor}`;
    } else if (r.sourceType === 'BANK_LINE' || r.sourceType === 'BANK_LINE_MANUAL') {
        label = 'Bonifico Fineco';
    } else if (r.sourceType === 'FLORIST_PAYOUT') {
        label = `Compenso ${(r.documentRef || r.description || 'ordine').slice(0, 40)}`;
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

/**
 * Union-find: collassa scontrini/manuali/compensi sullo stesso bonifico/ordine/TRN.
 * Se esiste il flusso bancario reale, resta UNICA riga di uscita (documenti → allegati).
 */
export function consolidateAuthorityOutflows<T extends FiscalDedupableEntry>(rows: T[]): T[] {
    const candidates = rows
        .map((r, index) => ({ r, index }))
        .filter(({ r }) => isDocumentOrFloristOutflow(r));
    if (candidates.length < 2) return rows;

    const parent = new Map<number, number>();
    const find = (i: number): number => {
        let p = parent.get(i) ?? i;
        while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
        parent.set(i, p);
        return p;
    };
    const union = (a: number, b: number) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    };

    for (const { index } of candidates) parent.set(index, index);

    // 1) Unione su chiavi forti (escluso AMT generico)
    const keyToIndexes = new Map<string, number[]>();
    for (const { r, index } of candidates) {
        for (const key of authorityOutflowClusterKeys(r)) {
            if (key.startsWith('AMT:')) continue;
            const list = keyToIndexes.get(key) || [];
            list.push(index);
            keyToIndexes.set(key, list);
        }
    }
    for (const indexes of keyToIndexes.values()) {
        for (let i = 1; i < indexes.length; i++) union(indexes[0]!, indexes[i]!);
    }

    // 2) Unione vendor+importo: solo se almeno un membro del cluster ha già banca/TRN/ordine
    //    oppure due documenti con stesso importo e token vendor in comune.
    const byAmount = new Map<number, Array<{ r: T; index: number }>>();
    for (const c of candidates) {
        const abs = Math.abs(c.r.totalCents);
        const list = byAmount.get(abs) || [];
        list.push(c);
        byAmount.set(abs, list);
    }

    const clusterHasAuthority = (root: number): boolean => {
        for (const { r, index } of candidates) {
            if (find(index) !== root) continue;
            if (bankLineRef(r) || extractBareFinecoTrn(r.description || '')) return true;
            if (
                r.sourceType === 'BANK_LINE' ||
                r.sourceType === 'BANK_LINE_MANUAL' ||
                r.sourceType.startsWith('STRIPE') ||
                r.sourceType.startsWith('PAYPAL')
            ) {
                return true;
            }
        }
        return false;
    };

    for (const group of byAmount.values()) {
        if (group.length < 2) continue;
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const a = group[i]!;
                const b = group[j]!;
                if (!vendorsOverlap(expenseVendorBlob(a.r), expenseVendorBlob(b.r))) continue;
                const ra = find(a.index);
                const rb = find(b.index);
                // Unisci se condividono già autorità, oppure se uno dei due cluster ha banca,
                // oppure entrambi sono documenti (scontrini multipli stesso fornitore/importo).
                const authA = clusterHasAuthority(ra);
                const authB = clusterHasAuthority(rb);
                const bothDocs =
                    !authA &&
                    !authB &&
                    a.r.sourceType !== 'BANK_LINE' &&
                    b.r.sourceType !== 'BANK_LINE';
                if (authA || authB || bothDocs || ra === rb) {
                    union(a.index, b.index);
                }
            }
        }
    }

    // 3) Materializza cluster
    const clusters = new Map<number, T[]>();
    for (const { r, index } of candidates) {
        const root = find(index);
        const list = clusters.get(root) || [];
        list.push(r);
        clusters.set(root, list);
    }

    const suppressIds = new Set<string>();
    const enrichedById = new Map<string, T>();

    for (const members of clusters.values()) {
        if (members.length < 2) continue;
        const primary = pickReconciledPrimary(members);
        const enriched = enrichPrimaryWithAttachments(primary, members);
        if (primary.id) enrichedById.set(primary.id, enriched);
        for (const m of members) {
            if (m.id && m.id !== primary.id) suppressIds.add(m.id);
        }
    }

    if (!suppressIds.size) return rows;

    return rows
        .filter((r) => !r.id || !suppressIds.has(r.id))
        .map((r) => (r.id && enrichedById.has(r.id) ? enrichedById.get(r.id)! : r));
}

/**
 * Se esiste già un'autorità di cassa (banca/gateway) per lo stesso ordine+importo,
 * elimina uscite subordinate residue (compenso/scontrino/JSON) non catturate dal cluster.
 */
export function suppressSubordinateOutflowsCoveredByAuthority<T extends FiscalDedupableEntry>(
    rows: T[]
): T[] {
    const authorityOrderAmounts = new Set<string>();
    const authorityVendorAmounts: Array<{ tokens: Set<string>; abs: number }> = [];

    for (const r of rows) {
        if (!isOutflowExpense(r)) continue;
        const isAuth =
            r.sourceType === 'BANK_LINE' ||
            r.sourceType === 'BANK_LINE_MANUAL' ||
            r.sourceType.startsWith('STRIPE') ||
            r.sourceType.startsWith('PAYPAL');
        if (!isAuth) continue;
        const abs = Math.abs(r.totalCents);
        const orderRef = extractOrderBusinessRef(r);
        if (orderRef) authorityOrderAmounts.add(`${orderRef}|${abs}`);
        authorityVendorAmounts.push({ tokens: significantVendorTokens(expenseVendorBlob(r)), abs });
    }

    if (!authorityOrderAmounts.size && !authorityVendorAmounts.length) return rows;

    return rows.filter((r) => {
        if (!isOutflowExpense(r)) return true;
        if (
            r.sourceType === 'BANK_LINE' ||
            r.sourceType === 'BANK_LINE_MANUAL' ||
            r.sourceType.startsWith('STRIPE') ||
            r.sourceType.startsWith('PAYPAL')
        ) {
            return true;
        }
        if (!isDocumentOrFloristOutflow(r)) return true;

        const abs = Math.abs(r.totalCents);
        const orderRef = extractOrderBusinessRef(r);
        if (orderRef && authorityOrderAmounts.has(`${orderRef}|${abs}`)) return false;

        const tokens = significantVendorTokens(expenseVendorBlob(r));
        if (tokens.size) {
            for (const auth of authorityVendorAmounts) {
                if (auth.abs !== abs) continue;
                for (const t of tokens) {
                    if (auth.tokens.has(t)) return false;
                }
            }
        }
        return true;
    });
}

/** Pipeline unica per listati Prima Nota e aggregati PnL. */
export function applyFiscalAuthorityHierarchy<T extends FiscalDedupableEntry>(rows: T[]): T[] {
    // PayPal prima: gli storni tecnici non devono coprire ricavi ordine come autorità.
    const step0 = applyPaypalStateMachine(rows);
    const step1 = excludeOrdersCoveredByFiscalAuthority(step0);
    const step2 = excludeJsonRevenuesCoveredByFiscalAuthority(step1);
    const step3 = dedupeByCanonicalMovementKey(step2);
    const step4 = dedupeSupplierInvoices(step3);
    const step5 = consolidateAuthorityOutflows(step4);
    const step6 = consolidateReconciledPayments(step5);
    const step7 = excludeJsonExpensesCoveredByReconciledPayment(step6);
    const step8 = suppressSubordinateOutflowsCoveredByAuthority(step7);
    return dedupeByNaturalFiscalKey(step8);
}
