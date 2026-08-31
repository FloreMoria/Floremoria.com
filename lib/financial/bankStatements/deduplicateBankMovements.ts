/**
 * Deduplica intelligente movimenti Fineco: priorità fonte + matching semantico causale.
 *
 * Priorità (alta → bassa):
 * 1. ESTRATTO_CONTO_PDF / FINECO_PDF
 * 2. IMPORT_CSV / EXCEL
 * 3. MANUALE / INSERIMENTO_MANUALE (paste home banking)
 */
import {
    buildFinecoDedupKey,
    normalizeCausale,
} from './parseFinecoPaste';

export type BankMovementSource =
    | 'ESTRATTO_CONTO_PDF'
    | 'FINECO_PDF'
    | 'IMPORT_CSV'
    | 'EXCEL'
    | 'MANUALE'
    | 'INSERIMENTO_MANUALE';

const SOURCE_PRIORITY: Record<BankMovementSource, number> = {
    ESTRATTO_CONTO_PDF: 100,
    FINECO_PDF: 100,
    IMPORT_CSV: 80,
    EXCEL: 80,
    MANUALE: 30,
    INSERIMENTO_MANUALE: 30,
};

const STOP_WORDS = new Set([
    'BONIFICO',
    'SEPA',
    'ADDEBITO',
    'ACCREDITO',
    'PAGAMENTO',
    'COMMISSIONE',
    'CANONE',
    'GIROCONTO',
    'POS',
    'CARTA',
    'FINE',
    'EURO',
    'EUR',
    'DA',
    'PER',
    'CON',
    'THE',
    'AND',
]);

const STRONG_VENDOR_TOKENS = new Set([
    'STRIPE',
    'PAYPAL',
    'GOOGLE',
    'META',
    'FACEBOOK',
    'VERCEL',
    'OPENAI',
    'ANTHROPIC',
    'CURSOR',
    'AWS',
    'AMAZON',
    'MICROSOFT',
    'APPLE',
    'ADOBE',
    'SHOPIFY',
]);

export type DedupBankMovement = {
    id?: string;
    dateIso: string | null;
    amountCents: number;
    description: string;
    source: BankMovementSource;
    matchStatus?: string | null;
    matchType?: string | null;
    matchNotes?: string | null;
    matchedOrderId?: string | null;
    matchedTxId?: string | null;
    matchScore?: number | null;
    fingerprint?: string | null;
    documentId?: string;
};

export function bankMovementSourcePriority(source: BankMovementSource): number {
    return SOURCE_PRIORITY[source] ?? 0;
}

/** Inferisce la fonte da metadati documento estratto conto. */
export function inferBankMovementSource(input: {
    fileName: string;
    contentType?: string | null;
    metadataJson?: unknown;
}): BankMovementSource {
    const meta =
        input.metadataJson && typeof input.metadataJson === 'object'
            ? (input.metadataJson as Record<string, unknown>)
            : null;
    const metaSource = String(meta?.source || '').toLowerCase();
    const name = input.fileName.toLowerCase();
    const ct = (input.contentType || '').toLowerCase();

    if (metaSource === 'fineco_paste' || name.includes('paste') || name.includes('incolla')) {
        return 'INSERIMENTO_MANUALE';
    }
    if (name.includes('manual') || metaSource === 'manual') {
        return 'MANUALE';
    }
    if (ct.includes('pdf') || name.endsWith('.pdf')) {
        return 'FINECO_PDF';
    }
    if (
        ct.includes('csv') ||
        ct.includes('spreadsheet') ||
        ct.includes('excel') ||
        name.endsWith('.csv') ||
        name.endsWith('.xlsx') ||
        name.endsWith('.xls')
    ) {
        return name.endsWith('.xlsx') || name.endsWith('.xls') || ct.includes('spreadsheet')
            ? 'EXCEL'
            : 'IMPORT_CSV';
    }
    return 'ESTRATTO_CONTO_PDF';
}

export function movementDateIso(
    accountingDate: Date | string | null | undefined,
    valueDate?: Date | string | null | undefined
): string | null {
    const pick = accountingDate || valueDate;
    if (!pick) return null;
    const iso =
        pick instanceof Date
            ? pick.toISOString().slice(0, 10)
            : String(pick).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function extractTrnToken(description: string): string | null {
    const u = description.toUpperCase().replace(/\s+/g, ' ');
    const labeled = u.match(
        /\b(?:TRN|TRANS(?:ACTION)?\s*ID|TRANSID|ID\s*TRN|CRO|C\.?R\.?O\.?)\s*[:.#]?\s*([A-Z0-9][A-Z0-9\s]{5,48})/
    )?.[1];
    if (!labeled) return null;
    const trn = labeled.replace(/\s+/g, '');
    if (trn.length < 8) return null;
    return trn;
}

/** Token identificativi condivisi (vendor, TRN, parole chiave). */
export function extractIdentityTokens(description: string): Set<string> {
    const tokens = new Set<string>();
    const trn = extractTrnToken(description);
    if (trn) tokens.add(`trn:${trn}`);

    const norm = normalizeCausale(description);
    for (const word of norm.split(' ')) {
        if (word.length >= 4 && !STOP_WORDS.has(word)) {
            tokens.add(word);
        }
    }
    for (const vendor of STRONG_VENDOR_TOKENS) {
        if (norm.includes(vendor)) tokens.add(vendor);
    }
    return tokens;
}

function tokenOverlapScore(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let shared = 0;
    for (const t of a) {
        if (b.has(t)) shared += 1;
    }
    return shared;
}

/** Due causali descrivono lo stesso movimento bancario? */
export function descriptionsAreEquivalent(
    a: string,
    b: string,
    dateIso: string | null,
    amountCents: number
): boolean {
    const keyA = buildFinecoDedupKey(dateIso, amountCents, a);
    const keyB = buildFinecoDedupKey(dateIso, amountCents, b);
    if (keyA === keyB) return true;

    const na = normalizeCausale(a);
    const nb = normalizeCausale(b);
    if (!na || !nb) return false;
    if (na === nb) return true;

    const minLen = Math.min(na.length, nb.length);
    if (minLen >= 8 && (na.includes(nb) || nb.includes(na))) return true;

    const ta = extractIdentityTokens(a);
    const tb = extractIdentityTokens(b);
    for (const t of ta) {
        if (t.startsWith('trn:') && tb.has(t)) return true;
    }
    const overlap = tokenOverlapScore(ta, tb);
    if (overlap >= 2) return true;
    if (overlap >= 1 && [...ta].some((t) => STRONG_VENDOR_TOKENS.has(t) && tb.has(t))) {
        return true;
    }
    return false;
}

export function movementsAreDuplicates(a: DedupBankMovement, b: DedupBankMovement): boolean {
    if (a.amountCents !== b.amountCents) return false;
    const dateA = a.dateIso;
    const dateB = b.dateIso;
    if (!dateA || !dateB || dateA !== dateB) return false;
    return descriptionsAreEquivalent(a.description, b.description, dateA, a.amountCents);
}

export type MergedMatchFields = {
    matchStatus: string;
    matchType: string | null;
    matchNotes: string | null;
    matchedOrderId: string | null;
    matchedTxId: string | null;
    matchScore: number | null;
};

/** Unisce categorie/note manuali nel movimento ufficiale se quest'ultimo è ancora UNMATCHED. */
export function mergeBankLineMatchFields(
    official: MergedMatchFields,
    manual: MergedMatchFields
): MergedMatchFields {
    const officialMatched =
        official.matchStatus === 'MATCHED' ||
        Boolean(official.matchType && official.matchType !== 'MANUAL_MATCH');
    if (officialMatched) return official;

    const manualMatched =
        manual.matchStatus === 'MATCHED' ||
        Boolean(manual.matchType && manual.matchType !== 'MANUAL_MATCH');
    if (!manualMatched) return official;

    return {
        matchStatus: manual.matchStatus || 'MATCHED',
        matchType: manual.matchType || official.matchType,
        matchNotes: manual.matchNotes || official.matchNotes,
        matchedOrderId: manual.matchedOrderId || official.matchedOrderId,
        matchedTxId: manual.matchedTxId || official.matchedTxId,
        matchScore: manual.matchScore ?? official.matchScore,
    };
}

export type DeduplicateResult<T extends DedupBankMovement> = {
    kept: T[];
    removed: T[];
    /** Per ogni rimosso, quale kept lo ha assorbito. */
    absorbedBy: Map<T, T>;
};

/**
 * Deduplica in-memory: mantiene la fonte a priorità più alta;
 * propaga matchType/matchNotes dal record manuale se utile.
 */
export function deduplicateBankMovements<T extends DedupBankMovement>(
    movements: T[]
): DeduplicateResult<T> {
    const kept: T[] = [];
    const removed: T[] = [];
    const absorbedBy = new Map<T, T>();

    for (const movement of movements) {
        let duplicateIdx = -1;
        for (let i = 0; i < kept.length; i += 1) {
            if (movementsAreDuplicates(movement, kept[i])) {
                duplicateIdx = i;
                break;
            }
        }

        if (duplicateIdx === -1) {
            kept.push({ ...movement });
            continue;
        }

        const existing = kept[duplicateIdx];
        const incomingPriority = bankMovementSourcePriority(movement.source);
        const existingPriority = bankMovementSourcePriority(existing.source);

        if (incomingPriority > existingPriority) {
            const merged = {
                ...movement,
                ...mergeBankLineMatchFields(
                    {
                        matchStatus: movement.matchStatus || 'UNMATCHED',
                        matchType: movement.matchType ?? null,
                        matchNotes: movement.matchNotes ?? null,
                        matchedOrderId: movement.matchedOrderId ?? null,
                        matchedTxId: movement.matchedTxId ?? null,
                        matchScore: movement.matchScore ?? null,
                    },
                    {
                        matchStatus: existing.matchStatus || 'UNMATCHED',
                        matchType: existing.matchType ?? null,
                        matchNotes: existing.matchNotes ?? null,
                        matchedOrderId: existing.matchedOrderId ?? null,
                        matchedTxId: existing.matchedTxId ?? null,
                        matchScore: existing.matchScore ?? null,
                    }
                ),
            };
            kept[duplicateIdx] = merged as T;
            removed.push(existing);
            absorbedBy.set(existing, merged as T);
        } else if (incomingPriority < existingPriority) {
            const merged = mergeBankLineMatchFields(
                {
                    matchStatus: existing.matchStatus || 'UNMATCHED',
                    matchType: existing.matchType ?? null,
                    matchNotes: existing.matchNotes ?? null,
                    matchedOrderId: existing.matchedOrderId ?? null,
                    matchedTxId: existing.matchedTxId ?? null,
                    matchScore: existing.matchScore ?? null,
                },
                {
                    matchStatus: movement.matchStatus || 'UNMATCHED',
                    matchType: movement.matchType ?? null,
                    matchNotes: movement.matchNotes ?? null,
                    matchedOrderId: movement.matchedOrderId ?? null,
                    matchedTxId: movement.matchedTxId ?? null,
                    matchScore: movement.matchScore ?? null,
                }
            );
            kept[duplicateIdx] = { ...existing, ...merged } as T;
            removed.push(movement);
            absorbedBy.set(movement, kept[duplicateIdx]);
        } else {
            removed.push(movement);
            absorbedBy.set(movement, existing);
        }
    }

    return { kept, removed, absorbedBy };
}

export type ImportSupersedePlan = {
    /** Riga DB da eliminare dopo insert del movimento ufficiale. */
    supersedeLineId: string;
    mergeMatchFrom: MergedMatchFields;
};

export type ImportDedupDecision =
    | { action: 'insert'; mergeMatchFrom?: MergedMatchFields }
    | { action: 'skip'; reason: 'duplicate_official' | 'fingerprint' }
    | { action: 'supersede'; plan: ImportSupersedePlan };

/** Valuta un singolo movimento in import rispetto all'archivio esistente. */
export function decideImportMovement<T extends DedupBankMovement>(
    incoming: T,
    existing: DedupBankMovement[]
): ImportDedupDecision {
    const incomingPriority = bankMovementSourcePriority(incoming.source);

    for (const ex of existing) {
        if (!movementsAreDuplicates(incoming, ex)) continue;

        const exPriority = bankMovementSourcePriority(ex.source);
        if (incomingPriority > exPriority && ex.id) {
            return {
                action: 'supersede',
                plan: {
                    supersedeLineId: ex.id,
                    mergeMatchFrom: {
                        matchStatus: ex.matchStatus || 'UNMATCHED',
                        matchType: ex.matchType ?? null,
                        matchNotes: ex.matchNotes ?? null,
                        matchedOrderId: ex.matchedOrderId ?? null,
                        matchedTxId: ex.matchedTxId ?? null,
                        matchScore: ex.matchScore ?? null,
                    },
                },
            };
        }
        if (incomingPriority <= exPriority) {
            return { action: 'skip', reason: 'duplicate_official' };
        }
    }

    return { action: 'insert' };
}
