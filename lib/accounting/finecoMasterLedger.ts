/**
 * Vista Prima Nota Fineco-centrica: il conto corrente è il registro mastro.
 *
 * Perché: PayPal/Stripe registrano movimenti transitori (pagamenti, payout, fee)
 * che si riflettono sul conto Fineco come unica fonte di verità bancaria.
 * In Prima Nota restano solo le righe BANK_LINE; i gateway diventano drill-down.
 *
 * Non persiste: opera in lettura sulla pipeline fiscale già deduplicata.
 */

import type { FiscalDedupableEntry } from '@/lib/financial/fiscalAuthorityDedupe';
import { isGatewayRelatedFinecoMovement } from '@/lib/financial/gatewayBankMatch';
import { isInternalTransferCategory } from '@/lib/financial/historicalLedgerTypes';

/** Componente drill-down gateway collegato a una riga Fineco. */
export type FinecoGatewayDrillDownLine = {
    id: string;
    sourceType: string;
    label: string;
    amountCents: number;
    accountingDate?: string | null;
};

export type FinecoGatewayDrillDown = {
    gateway: 'paypal' | 'stripe' | null;
    kind: 'sdd_debit' | 'payout_credit' | 'card_debit' | 'other';
    /** Righe gateway collegate (non visibili in elenco principale). */
    lines: FinecoGatewayDrillDownLine[];
    /** Corrispettivi vendite lordi (solo payout). */
    grossSalesCents?: number;
    /** Commissioni gateway trattenute (solo payout). */
    feesCents?: number;
    /** Netto accreditato su Fineco. */
    netCents: number;
};

const PAYOUT_MATCH_WINDOW_DAYS = 7;
const GATEWAY_PLATFORM_RE =
    /^(paypal|paypal\s*\(europe\)|paypal\s+europe|stripe|stripe\s+payments)/i;

function rowId(r: FiscalDedupableEntry): string {
    return r.id || r.sourceKey || r.sourceId || '';
}

function dayMs(d: Date | string | null | undefined): number | null {
    if (d == null || d === '') return null;
    const iso = d instanceof Date ? d.toISOString() : String(d);
    const t = Date.parse(iso.slice(0, 10));
    return Number.isFinite(t) ? t : null;
}

function withinDays(
    a: Date | string | null | undefined,
    b: Date | string | null | undefined,
    maxDays: number,
): boolean {
    const da = dayMs(a);
    const db = dayMs(b);
    if (da == null || db == null) return false;
    return Math.abs(da - db) <= maxDays * 86_400_000;
}

function absAmountMatch(a: number, b: number, tolerance = 2): boolean {
    return Math.abs(Math.abs(a) - Math.abs(b)) < tolerance;
}

function textBlob(r: FiscalDedupableEntry): string {
    const meta =
        r.metadataJson && typeof r.metadataJson === 'object'
            ? JSON.stringify(r.metadataJson)
            : '';
    return `${r.description || ''} ${r.counterpartyName || ''} ${r.sourceKey || ''} ${meta}`.toUpperCase();
}

function asMeta(r: FiscalDedupableEntry): Record<string, unknown> {
    return r.metadataJson && typeof r.metadataJson === 'object'
        ? (r.metadataJson as Record<string, unknown>)
        : {};
}

function mergeMeta<T extends FiscalDedupableEntry>(
    row: T,
    patch: Record<string, unknown>,
): T {
    return { ...row, metadataJson: { ...asMeta(row), ...patch } };
}

function isBankRow(r: FiscalDedupableEntry): boolean {
    return r.sourceType === 'BANK_LINE' || r.sourceType === 'BANK_LINE_MANUAL';
}

function isGatewayRow(r: FiscalDedupableEntry): boolean {
    return (
        r.sourceType === 'PAYPAL_MOVEMENT' ||
        r.sourceType === 'STRIPE_MOVEMENT' ||
        r.sourceType.startsWith('PAYPAL') ||
        r.sourceType.startsWith('STRIPE')
    );
}

function gatewayLabel(r: FiscalDedupableEntry): string {
    const cp = (r.counterpartyName || '').trim();
    if (cp && !GATEWAY_PLATFORM_RE.test(cp)) return cp;
    const desc = (r.description || '').trim();
    return desc.slice(0, 60) || r.sourceType;
}

function detectGateway(r: FiscalDedupableEntry): 'paypal' | 'stripe' | null {
    const blob = textBlob(r);
    if (r.sourceType.startsWith('PAYPAL') || /\bPAYPAL\b/.test(blob)) return 'paypal';
    if (r.sourceType.startsWith('STRIPE') || /\bSTRIPE\b/.test(blob)) return 'stripe';
    return null;
}

function isPayoutGatewayRow(r: FiscalDedupableEntry): boolean {
    if (!isGatewayRow(r)) return false;
    const meta = asMeta(r);
    if (meta.movementKind === 'payout' || meta.payoutId || meta.stripePayoutId) return true;
    const sk = (r.sourceKey || '').toUpperCase();
    return (
        r.category === 'PAYPAL_PAYOUT' ||
        r.category === 'TRASFERIMENTO_INTERNO' ||
        sk.includes('PAYOUT')
    );
}

function isOrderRevenue(r: FiscalDedupableEntry): boolean {
    return (
        r.sourceType === 'ORDER' &&
        (r.category === 'RICAVI_VENDITE' || r.category === 'ALTRI_RICAVI' || r.totalCents > 0)
    );
}

function isFeeRow(r: FiscalDedupableEntry): boolean {
    return (
        r.category === 'ONERI_BANCARI' ||
        (r.sourceKey || '').toUpperCase().includes('FEE') ||
        asMeta(r).movementKind === 'fee'
    );
}

/** Righe visibili nella Prima Nota cronologica (solo movimenti bancari reali). */
export function isFinecoMasterPrimaryRow(r: FiscalDedupableEntry): boolean {
    return isBankRow(r);
}

/** Righe da escludere dall'elenco principale (gateway transitorio / doppioni). */
export function isFinecoMasterSuppressedRow(r: FiscalDedupableEntry): boolean {
    if (isBankRow(r)) return false;

    // Gateway intermedi: sempre drill-down, mai riga autonoma.
    if (isGatewayRow(r)) return true;

    // Ricavi ordine già computati nei corrispettivi / payout.
    if (r.sourceType === 'ORDER') return true;

    // JSON locale / ricevute cliente non sono movimenti bancari.
    if (r.sourceType === 'JSON_ENTRY' || r.sourceType === 'CUSTOMER_RECEIPT') return true;

    // Giroconti gateway senza impatto bancario diretto.
    if (isInternalTransferCategory(r.category || '')) return true;

    // Payout fiorista duplicato se esiste già bonifico bancario collegato.
    if (r.sourceType === 'FLORIST_PAYOUT' && r.bankLineId) return true;

    // Spese SDI già consolidate su bonifico bancario.
    if (r.sourceType === 'MANUAL_EXPENSE' && r.bankLineId) return true;

    return false;
}

function buildDrillDownLine(r: FiscalDedupableEntry): FinecoGatewayDrillDownLine {
    const date =
        r.accountingDate instanceof Date
            ? r.accountingDate.toISOString().slice(0, 10)
            : r.accountingDate
              ? String(r.accountingDate).slice(0, 10)
              : null;
    return {
        id: rowId(r),
        sourceType: r.sourceType,
        label: gatewayLabel(r),
        amountCents: r.totalCents,
        accountingDate: date,
    };
}

function buildPayoutDrillDown(
    bankRow: FiscalDedupableEntry,
    gatewayRows: FiscalDedupableEntry[],
    allRows: FiscalDedupableEntry[],
): FinecoGatewayDrillDown {
    const absAmount = Math.abs(bankRow.totalCents);
    const gateway = detectGateway(bankRow) || detectGateway(gatewayRows[0] || bankRow);

    const matchedPayouts = gatewayRows.filter(isPayoutGatewayRow);
    const matchedFees = gatewayRows.filter(isFeeRow);

    // Corrispettivi ordine nel periodo del payout (±7 gg dalla data banca).
    const orderRevenues = allRows.filter(
        (r) =>
            isOrderRevenue(r) &&
            withinDays(bankRow.accountingDate, r.accountingDate, PAYOUT_MATCH_WINDOW_DAYS),
    );

    const grossSalesCents = orderRevenues.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const feesCents =
        matchedFees.reduce((s, r) => s + Math.abs(r.totalCents), 0) ||
        (grossSalesCents > absAmount ? grossSalesCents - absAmount : 0);

    const lines: FinecoGatewayDrillDownLine[] = [
        ...matchedPayouts.map(buildDrillDownLine),
        ...matchedFees.map(buildDrillDownLine),
        ...orderRevenues.slice(0, 20).map(buildDrillDownLine),
    ];

    return {
        gateway,
        kind: 'payout_credit',
        lines,
        grossSalesCents: grossSalesCents > 0 ? grossSalesCents : undefined,
        feesCents: feesCents > 0 ? feesCents : undefined,
        netCents: absAmount,
    };
}

/**
 * Arricchisce righe Fineco con drill-down gateway e filtra la vista mastro.
 *
 * @param rows Righe post-pipeline fiscale (output di applyFiscalAuthorityHierarchy).
 * @param drillDownSource Set completo pre-filtro per indicizzare righe gateway (default: rows).
 */
export function applyFinecoMasterLedger<T extends FiscalDedupableEntry>(
    rows: T[],
    drillDownSource?: T[],
): { rows: T[]; suppressedCount: number } {
    const source = drillDownSource || rows;

    const gatewayByAmount = new Map<number, T[]>();
    for (const r of source) {
        if (!isGatewayRow(r)) continue;
        const abs = Math.abs(r.totalCents);
        const bucket = gatewayByAmount.get(abs) || [];
        bucket.push(r);
        gatewayByAmount.set(abs, bucket);
    }

    const usedGatewayIds = new Set<string>();
    const enriched = new Map<string, T>();

    for (const bankRow of rows) {
        if (!isBankRow(bankRow)) continue;
        const bankId = rowId(bankRow);
        const absAmount = Math.abs(bankRow.totalCents);

        // SDD drill-down già in metadata da paypalSddReconcile (step 0b)
        const existingDrillDown = readFinecoGatewayDrillDown(bankRow.metadataJson);
        if (existingDrillDown) {
            enriched.set(bankId, bankRow);
            continue;
        }

        // Payout in entrata su Fineco
        if (
            bankRow.totalCents > 0 &&
            isGatewayRelatedFinecoMovement(bankRow.description || '', bankRow.totalCents)
        ) {
            const candidates = gatewayByAmount.get(absAmount) || [];
            const matched = candidates.filter(
                (gw) =>
                    !usedGatewayIds.has(rowId(gw)) &&
                    isPayoutGatewayRow(gw) &&
                    withinDays(bankRow.accountingDate, gw.accountingDate, PAYOUT_MATCH_WINDOW_DAYS),
            );
            if (matched.length > 0) {
                for (const gw of matched) usedGatewayIds.add(rowId(gw));
                const drillDown = buildPayoutDrillDown(bankRow, matched, source);
                enriched.set(
                    bankId,
                    mergeMeta(bankRow, {
                        finecoGatewayDrillDown: drillDown,
                        finecoMasterKind: 'payout_credit',
                    }),
                );
                console.info(
                    `[fineco-master] Payout credito Fineco ${bankId} €${(absAmount / 100).toFixed(2)} ` +
                        `↔ ${matched.length} righe gateway (drill-down)`,
                );
            }
        }
    }

    const result: T[] = [];
    let suppressedCount = 0;

    for (const r of rows) {
        const id = rowId(r);
        const enrichedRow = enriched.get(id);

        if (isFinecoMasterSuppressedRow(r)) {
            suppressedCount++;
            continue;
        }

        if (!isFinecoMasterPrimaryRow(r)) {
            // Spese SDI / compensi senza movimento bancario: fuori vista mastro.
            suppressedCount++;
            continue;
        }

        result.push(enrichedRow || r);
    }

    if (suppressedCount > 0) {
        console.info(
            `[fineco-master] Vista mastro: ${rows.length} → ${result.length} righe Fineco ` +
                `(${suppressedCount} righe gateway/intermedie escluse)`,
        );
    }

    return { rows: result, suppressedCount };
}

/** Estrae drill-down gateway da metadata riga (se presente). */
export function readFinecoGatewayDrillDown(
    metadataJson: unknown,
): FinecoGatewayDrillDown | null {
    if (!metadataJson || typeof metadataJson !== 'object') return null;
    const dd = (metadataJson as Record<string, unknown>).finecoGatewayDrillDown;
    if (!dd || typeof dd !== 'object') return null;
    return dd as FinecoGatewayDrillDown;
}
