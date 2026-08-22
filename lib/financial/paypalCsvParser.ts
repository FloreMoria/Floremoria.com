/**
 * Parser export CSV transazioni PayPal (IT/EN) → FinancialLedgerEntry.
 * Idempotenza su sourceKey PAYPAL_TX / PAYPAL_FEE / PAYPAL_PAYOUT / PAYPAL_REFUND.
 */

import Papa from 'papaparse';
import prisma from '@/lib/prisma';
import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';
import type { LedgerCategory, LedgerEntryInput } from '@/lib/financial/historicalLedgerTypes';

export type PaypalCsvRow = {
    transactionId: string;
    referenceId: string | null;
    accountingDate: Date;
    typeLabel: string;
    status: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    counterpartyName: string | null;
    description: string;
    kind: 'payment' | 'fee' | 'refund' | 'payout' | 'skip';
};

export type PaypalCsvParseResult = {
    rows: PaypalCsvRow[];
    warnings: string[];
    skippedRows: number;
};

export type PaypalCsvImportResult = {
    inserted: number;
    skipped: number;
    rowsParsed: number;
    payments: number;
    fees: number;
    refunds: number;
    payouts: number;
    grossInflowCents: number;
    grossOutflowCents: number;
    totalFeesCents: number;
    warnings: string[];
    lastImportAt: string;
};

const CSV_IMPORT_META_KEY = 'finance.paypal.last_csv_import';

function normKey(k: string): string {
    return k
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function findCol(row: Record<string, unknown>, candidates: string[]): string {
    const keys = Object.keys(row);
    const normKeys = keys.map((k) => ({ k, n: normKey(k) }));
    for (const cand of candidates) {
        const c = normKey(cand);
        const exact = normKeys.find((x) => x.n === c);
        if (exact && row[exact.k] != null && String(row[exact.k]).trim() !== '') {
            return String(row[exact.k]).trim();
        }
    }
    for (const cand of candidates) {
        const c = normKey(cand);
        if (c.length < 4) continue;
        const hit = normKeys.find((x) => x.n.includes(c) || c.includes(x.n));
        if (hit && row[hit.k] != null && String(row[hit.k]).trim() !== '') {
            return String(row[hit.k]).trim();
        }
    }
    return '';
}

function parseAmount(raw: unknown): number {
    if (raw == null || raw === '') return 0;
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw * 100);
    let s = String(raw).trim().replace(/\s/g, '').replace(/€/g, '').replace(/EUR/gi, '');
    if (!s || s === '-') return 0;
    const paren = /^\((.*)\)$/.exec(s);
    if (paren) s = `-${paren[1]}`;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function parsePaypalDateTime(dateRaw: string, timeRaw?: string, tzRaw?: string): Date | null {
    const date = dateRaw.trim();
    const time = (timeRaw || '').trim();
    if (!date) return null;

    const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        const base = `${iso[1]}-${iso[2]}-${iso[3]}`;
        if (time) {
            const d = new Date(`${base}T${time}${tzRaw ? ` ${tzRaw}` : 'Z'}`);
            if (!Number.isNaN(d.getTime())) return d;
        }
        const d = new Date(`${base}T12:00:00.000Z`);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    const dmy = date.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (dmy) {
        const d = Number(dmy[1]);
        const m = Number(dmy[2]);
        let y = Number(dmy[3]);
        if (y < 100) y += 2000;
        const base = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (time) {
            const t = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (t) {
                const hh = String(Number(t[1])).padStart(2, '0');
                const mm = t[2];
                const ss = t[3] || '00';
                const dt = new Date(`${base}T${hh}:${mm}:${ss}Z`);
                if (!Number.isNaN(dt.getTime())) return dt;
            }
        }
        const dt = new Date(`${base}T12:00:00.000Z`);
        return Number.isNaN(dt.getTime()) ? null : dt;
    }

    const fallback = new Date(date);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function classifyPaypalType(typeLabel: string): PaypalCsvRow['kind'] {
    const t = typeLabel.toLowerCase();
    if (/rimborso|refund|storno|chargeback|contestazione/.test(t)) return 'refund';
    if (
        /trasferimento|withdrawal|prelievo|bank|bonifico|payout|versamento|user initiated/.test(t)
    ) {
        return 'payout';
    }
    if (/^fee$|tariffa|commissione/.test(t) && !/pagamento|payment/.test(t)) return 'fee';
    if (/holding|reserve|conversione valuta|currency conversion|general authorization/.test(t)) {
        return 'skip';
    }
    if (/pagamento|payment|checkout|credit|vendita|express|mobile/.test(t)) return 'payment';
    return 'payment';
}

function isCompletedStatus(status: string): boolean {
    const s = status.toLowerCase();
    if (!s) return true;
    return !/(denied|failed|cancelled|canceled|annullato|negato|rifiutato|pending|in sospeso)/.test(
        s
    );
}

function findCsvHeaderLine(text: string): string {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const lower = lines[i].toLowerCase();
        const hasId =
            lower.includes('transaction id') ||
            lower.includes('id transazione') ||
            lower.includes('codice transazione');
        const hasDate = lower.includes('"date"') || lower.startsWith('date,') || lower.includes('data');
        const hasGross = lower.includes('gross') || lower.includes('lordo');
        if (hasId && hasDate && hasGross) {
            return lines.slice(i).join('\n');
        }
    }
    return text.replace(/^\uFEFF/, '');
}

function syntheticId(row: Record<string, unknown>, idx: number): string {
    const parts = [
        findCol(row, ['Date', 'Data']),
        findCol(row, ['Gross', 'Lordo', 'Importo lordo']),
        findCol(row, ['Type', 'Tipo']),
        findCol(row, ['Name', 'Nome']),
        String(idx),
    ].join('|');
    return `SYN_${Buffer.from(parts).toString('base64url').slice(0, 40)}`;
}

export function parsePaypalCsvText(text: string): PaypalCsvParseResult {
    const warnings: string[] = [];
    let skippedRows = 0;
    const csvBody = findCsvHeaderLine(text);

    const parsed = Papa.parse<Record<string, unknown>>(csvBody, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
    });

    if (parsed.errors.length) {
        warnings.push(
            ...parsed.errors.slice(0, 5).map((e) => `CSV riga ${e.row}: ${e.message}`)
        );
    }

    const rows: PaypalCsvRow[] = [];

    parsed.data.forEach((raw, idx) => {
        const typeLabel = findCol(raw, ['Type', 'Tipo', 'Tipo transazione']);
        const status = findCol(raw, ['Status', 'Stato']);
        if (!typeLabel) {
            skippedRows += 1;
            return;
        }
        if (!isCompletedStatus(status)) {
            skippedRows += 1;
            return;
        }

        const currency = (
            findCol(raw, ['Currency', 'Valuta']) || 'EUR'
        ).toUpperCase();
        if (currency !== 'EUR') {
            skippedRows += 1;
            warnings.push(`Saltata riga ${idx + 2}: valuta ${currency} (solo EUR).`);
            return;
        }

        let transactionId = findCol(raw, [
            'Transaction ID',
            'ID transazione',
            'Codice transazione',
            'Transaction Id',
        ]);
        if (!transactionId) transactionId = syntheticId(raw, idx);

        const referenceId =
            findCol(raw, [
                'Reference Txn ID',
                'Codice riferimento transazione',
                'Reference Transaction ID',
            ]) || null;

        const dateRaw = findCol(raw, ['Date', 'Data']);
        const timeRaw = findCol(raw, ['Time', 'Ora']);
        const tzRaw = findCol(raw, ['Time Zone', 'Fuso orario']);
        const accountingDate = parsePaypalDateTime(dateRaw, timeRaw, tzRaw);
        if (!accountingDate) {
            skippedRows += 1;
            warnings.push(`Riga ${idx + 2}: data non interpretabile (${dateRaw}).`);
            return;
        }

        const grossCents = parseAmount(
            findCol(raw, ['Gross', 'Lordo', 'Importo lordo', 'Importo Lordo'])
        );
        const feeCents = Math.abs(
            parseAmount(
                findCol(raw, [
                    'Fee',
                    'Commissione',
                    'Tariffa',
                    'Commissione/Tariffa PayPal',
                    'Commissione PayPal',
                ])
            )
        );
        const netRaw = findCol(raw, ['Net', 'Netto', 'Importo netto', 'Importo Netto']);
        const netCents = netRaw ? parseAmount(netRaw) : grossCents - (grossCents >= 0 ? feeCents : -feeCents);

        const name = findCol(raw, ['Name', 'Nome']) || null;
        const fromEmail = findCol(raw, ['From Email Address', 'Indirizzo email mittente']);
        const itemTitle = findCol(raw, ['Item Title', 'Titolo oggetto', 'Oggetto']);
        const kind = classifyPaypalType(typeLabel);

        const description = [typeLabel, name, itemTitle, referenceId ? `rif.${referenceId}` : '']
            .filter(Boolean)
            .join(' · ')
            .slice(0, 2000);

        rows.push({
            transactionId,
            referenceId,
            accountingDate,
            typeLabel,
            status,
            grossCents,
            feeCents,
            netCents,
            currency,
            counterpartyName: name || fromEmail || null,
            description: description || typeLabel,
            kind,
        });
    });

    if (!rows.length) {
        warnings.push(
            'Nessuna riga PayPal riconosciuta. Verifica export Attività → Cronologia transazioni → CSV.'
        );
    }

    return { rows, warnings, skippedRows };
}

function ledgerEntriesForCsvRow(row: PaypalCsvRow): LedgerEntryInput[] {
    const entries: LedgerEntryInput[] = [];
    const metaBase = {
        provider: 'paypal',
        csvImport: true,
        typeLabel: row.typeLabel,
        referenceId: row.referenceId,
        feeCents: row.feeCents,
        netCents: row.netCents,
    };

    if (row.kind === 'skip') return entries;

    if (row.kind === 'fee') {
        const feeSigned = row.grossCents !== 0 ? row.grossCents : -row.feeCents;
        if (feeSigned === 0) return entries;
        entries.push({
            sourceKey: `PAYPAL_FEE:${row.transactionId}`.slice(0, 180),
            sourceType: 'PAYPAL_MOVEMENT',
            sourceId: `fee_${row.transactionId}`.slice(0, 128),
            direction: feeSigned >= 0 ? 'ENTRATA' : 'USCITA',
            category: 'ONERI_BANCARI',
            accountingDate: row.accountingDate,
            description: row.description,
            counterpartyName: row.counterpartyName || 'PayPal',
            netCents: feeSigned,
            vatRate: 0,
            vatCents: 0,
            totalCents: feeSigned,
            reconciliationStatus: 'MATCHED',
            documentRef: row.transactionId,
            metadataJson: metaBase,
        });
        return entries;
    }

    if (row.kind === 'payout') {
        if (row.grossCents === 0 && row.netCents === 0) return entries;
        const amount = row.grossCents !== 0 ? row.grossCents : row.netCents;
        entries.push({
            sourceKey: `PAYPAL_PAYOUT:${row.transactionId}`.slice(0, 180),
            sourceType: 'PAYPAL_MOVEMENT',
            sourceId: row.transactionId.slice(0, 128),
            direction: amount >= 0 ? 'ENTRATA' : 'USCITA',
            category: 'PAYPAL_PAYOUT',
            accountingDate: row.accountingDate,
            description: row.description,
            counterpartyName: row.counterpartyName || 'PayPal',
            netCents: amount,
            vatRate: 0,
            vatCents: 0,
            totalCents: amount,
            reconciliationStatus: 'N/A',
            documentRef: row.transactionId,
            metadataJson: metaBase,
        });
        return entries;
    }

    const isRefund = row.kind === 'refund';
    const gross = isRefund
        ? row.grossCents !== 0
            ? row.grossCents
            : row.netCents
        : row.grossCents !== 0
          ? row.grossCents
          : row.netCents;

    if (gross !== 0) {
        const txPrefix = isRefund ? 'PAYPAL_REFUND' : 'PAYPAL_TX';
        entries.push({
            sourceKey: `${txPrefix}:${row.transactionId}`.slice(0, 180),
            sourceType: 'PAYPAL_MOVEMENT',
            sourceId: row.transactionId.slice(0, 128),
            direction: gross >= 0 ? 'ENTRATA' : 'USCITA',
            category: isRefund ? 'RIMBORSI' : 'RICAVI_VENDITE',
            accountingDate: row.accountingDate,
            description: row.description,
            counterpartyName: row.counterpartyName || 'PayPal',
            netCents: gross,
            vatRate: 0,
            vatCents: 0,
            totalCents: gross,
            reconciliationStatus: 'UNMATCHED',
            documentRef: row.transactionId,
            metadataJson: metaBase,
        });
    }

    if (row.feeCents > 0) {
        const feeSigned = isRefund ? row.feeCents : -row.feeCents;
        const feeKey = isRefund ? `PAYPAL_FEE:REFUND:${row.transactionId}` : `PAYPAL_FEE:${row.transactionId}`;
        entries.push({
            sourceKey: feeKey.slice(0, 180),
            sourceType: 'PAYPAL_MOVEMENT',
            sourceId: `fee_${row.transactionId}`.slice(0, 128),
            direction: feeSigned >= 0 ? 'ENTRATA' : 'USCITA',
            category: 'ONERI_BANCARI',
            accountingDate: row.accountingDate,
            description: isRefund
                ? `Storno commissione PayPal — ${row.transactionId}`
                : `Commissione PayPal — ${row.transactionId}`,
            counterpartyName: 'PayPal',
            netCents: feeSigned,
            vatRate: 0,
            vatCents: 0,
            totalCents: feeSigned,
            reconciliationStatus: isRefund ? 'UNMATCHED' : 'MATCHED',
            documentRef: row.transactionId,
            metadataJson: { ...metaBase, feeReversal: isRefund },
        });
    }

    return entries;
}

export async function importPaypalCsvToLedger(
    rows: PaypalCsvRow[],
    opts?: { fileName?: string }
): Promise<PaypalCsvImportResult> {
    const warnings: string[] = [];
    let payments = 0;
    let fees = 0;
    let refunds = 0;
    let payouts = 0;
    let grossInflowCents = 0;
    let grossOutflowCents = 0;
    let totalFeesCents = 0;

    const ledgerBatch: LedgerEntryInput[] = [];

    for (const row of rows) {
        if (row.kind === 'payment') {
            payments += 1;
            if (row.grossCents > 0) grossInflowCents += row.grossCents;
        } else if (row.kind === 'fee') fees += 1;
        else if (row.kind === 'refund') {
            refunds += 1;
            if (row.grossCents < 0) grossOutflowCents += Math.abs(row.grossCents);
        } else if (row.kind === 'payout') {
            payouts += 1;
            const amt = row.grossCents !== 0 ? row.grossCents : row.netCents;
            if (amt < 0) grossOutflowCents += Math.abs(amt);
        }
        totalFeesCents += row.feeCents;
        ledgerBatch.push(...ledgerEntriesForCsvRow(row));
    }

    const { inserted, skipped } = await appendLedgerEntries(ledgerBatch);
    const lastImportAt = new Date().toISOString();

    await prisma.systemState.upsert({
        where: { key: CSV_IMPORT_META_KEY },
        create: {
            key: CSV_IMPORT_META_KEY,
            value: JSON.stringify({
                lastImportAt,
                fileName: opts?.fileName || null,
                rowsParsed: rows.length,
                inserted,
                skipped,
                payments,
                fees,
                refunds,
                payouts,
            }),
        },
        update: {
            value: JSON.stringify({
                lastImportAt,
                fileName: opts?.fileName || null,
                rowsParsed: rows.length,
                inserted,
                skipped,
                payments,
                fees,
                refunds,
                payouts,
            }),
        },
    });

    return {
        inserted,
        skipped,
        rowsParsed: rows.length,
        payments,
        fees,
        refunds,
        payouts,
        grossInflowCents,
        grossOutflowCents,
        totalFeesCents,
        warnings,
        lastImportAt,
    };
}

export async function getPaypalCsvImportMeta(): Promise<{
    lastImportAt: string | null;
    fileName: string | null;
    rowsParsed: number;
    inserted: number;
} | null> {
    const row = await prisma.systemState.findUnique({ where: { key: CSV_IMPORT_META_KEY } });
    if (!row?.value) return null;
    try {
        const parsed = JSON.parse(row.value) as {
            lastImportAt?: string;
            fileName?: string | null;
            rowsParsed?: number;
            inserted?: number;
        };
        return {
            lastImportAt: parsed.lastImportAt || null,
            fileName: parsed.fileName ?? null,
            rowsParsed: parsed.rowsParsed ?? 0,
            inserted: parsed.inserted ?? 0,
        };
    } catch {
        return null;
    }
}

export async function importPaypalCsvBuffer(
    buffer: Buffer,
    fileName: string
): Promise<PaypalCsvImportResult & { parseWarnings: string[]; skippedRows: number }> {
    const text = buffer.toString('utf-8');
    const { rows, warnings, skippedRows } = parsePaypalCsvText(text);
    if (!rows.length) {
        return {
            inserted: 0,
            skipped: 0,
            rowsParsed: 0,
            payments: 0,
            fees: 0,
            refunds: 0,
            payouts: 0,
            grossInflowCents: 0,
            grossOutflowCents: 0,
            totalFeesCents: 0,
            warnings: [...warnings, 'Nessuna transazione importabile dal CSV.'],
            lastImportAt: new Date().toISOString(),
            parseWarnings: warnings,
            skippedRows,
        };
    }
    const result = await importPaypalCsvToLedger(rows, { fileName });
    return { ...result, parseWarnings: warnings, skippedRows };
}
