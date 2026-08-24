import * as fs from 'fs';
import * as path from 'path';
import { BankTransaction, AccountingEntry, FinancialLedger } from './types';
import {
    isFinanceSeedEntryId,
    isFinanceSeedTxId,
} from '@/lib/financial/formatFinanceDate';

const IS_VERCEL = process.env.VERCEL === '1';
const LEDGER_PATH = IS_VERCEL
    ? path.join('/tmp', 'financial_ledger.json')
    : path.join(process.cwd(), 'financial_ledger.json');

/** Ledger vuoto: nessun seed demo. Solo dati reali. Scadenze vivono su Neon. */
const EMPTY_LEDGER: FinancialLedger = {
    transactions: [],
    accountingEntries: [],
    completedDeadlineIds: [],
    deadlineStatusById: {},
};

function sanitizeLedger(ledger: FinancialLedger): FinancialLedger {
    return {
        ...ledger,
        transactions: (ledger.transactions || []).filter((tx) => !isFinanceSeedTxId(tx.id)),
        accountingEntries: (ledger.accountingEntries || []).filter(
            (e) => !isFinanceSeedEntryId(e.id)
        ),
        // Scadenze F24: non persistono più sul file (vedi financeDeadlineStore / Neon).
        completedDeadlineIds: [],
        deadlineStatusById: {},
    };
}

/** Legge il ledger; rimuove seed demo residui e non ripopola dati fittizi. */
export function getLedger(): FinancialLedger {
    try {
        if (!fs.existsSync(LEDGER_PATH)) {
            saveLedger(EMPTY_LEDGER);
            return { ...EMPTY_LEDGER };
        }
        const raw = fs.readFileSync(LEDGER_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as FinancialLedger;
        const cleaned = sanitizeLedger(parsed);
        if (
            cleaned.transactions.length !== (parsed.transactions || []).length ||
            cleaned.accountingEntries.length !== (parsed.accountingEntries || []).length
        ) {
            // Riscrive senza seed; le scadenze restano in memoria finché migrate Neon non le assorbe.
            saveLedger({
                ...cleaned,
                completedDeadlineIds: parsed.completedDeadlineIds || [],
                deadlineStatusById: parsed.deadlineStatusById || {},
            });
        }
        return {
            ...cleaned,
            completedDeadlineIds: parsed.completedDeadlineIds || [],
            deadlineStatusById: parsed.deadlineStatusById || {},
        };
    } catch (error) {
        console.error('[ledgerStore getLedger] Errore lettura, restituisco vuoto.', error);
        return { ...EMPTY_LEDGER };
    }
}

/**
 * Snapshot scadenze ancora presenti sul file (prima della migrazione Neon).
 * Dopo saveLedger le scadenze sul file sono sempre vuote.
 */
export function peekFileDeadlineState(): {
    completedDeadlineIds: string[];
    deadlineStatusById: Record<string, string>;
} {
    try {
        if (!fs.existsSync(LEDGER_PATH)) {
            return { completedDeadlineIds: [], deadlineStatusById: {} };
        }
        const raw = fs.readFileSync(LEDGER_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as FinancialLedger;
        return {
            completedDeadlineIds: parsed.completedDeadlineIds || [],
            deadlineStatusById: parsed.deadlineStatusById || {},
        };
    } catch {
        return { completedDeadlineIds: [], deadlineStatusById: {} };
    }
}

export function saveLedger(ledger: FinancialLedger): void {
    const tempPath = `${LEDGER_PATH}.tmp`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(sanitizeLedger(ledger), null, 4), 'utf-8');
        fs.renameSync(tempPath, LEDGER_PATH);
    } catch (error) {
        console.error('[ledgerStore saveLedger] Errore salvataggio', error);
        if (fs.existsSync(tempPath)) {
            try {
                fs.unlinkSync(tempPath);
            } catch {
                /* ignore */
            }
        }
        throw error;
    }
}

export function addTransaction(transaction: BankTransaction): void {
    if (isFinanceSeedTxId(transaction.id)) return;
    const ledger = getLedger();
    if (ledger.transactions.some((tx) => tx.id === transaction.id)) return;
    ledger.transactions.push(transaction);
    saveLedger(ledger);
}

export function addAccountingEntries(entries: AccountingEntry[]): void {
    const real = entries.filter((e) => !isFinanceSeedEntryId(e.id));
    if (!real.length) return;
    const ledger = getLedger();
    for (const entry of real) {
        if (!ledger.accountingEntries.some((e) => e.id === entry.id)) {
            ledger.accountingEntries.push(entry);
        }
    }
    saveLedger(ledger);
    void import('@/lib/financial/historicalLedgerSync')
        .then(({ persistJsonAccountingEntry }) =>
            Promise.all(real.map((e) => persistJsonAccountingEntry(mapEntryForPersist(e))))
        )
        .catch((err) => console.warn('[ledgerStore] dual-write PG fallito', err));
}

/**
 * Upsert scritture Prima Nota: sourceKey stabile JSON_ENTRY:{id} (niente :v&lt;Date.now()&gt;).
 * Perché: il suffisso temporale creava una nuova riga Neon a ogni aggiornamento.
 */
export function upsertAccountingEntries(entries: AccountingEntry[]): void {
    const real = entries.filter((e) => !isFinanceSeedEntryId(e.id));
    if (!real.length) return;
    const ledger = getLedger();
    for (const entry of real) {
        const idx = ledger.accountingEntries.findIndex((e) => e.id === entry.id);
        if (idx >= 0) ledger.accountingEntries[idx] = entry;
        else ledger.accountingEntries.push(entry);
    }
    saveLedger(ledger);
    void import('@/lib/financial/historicalLedgerSync')
        .then(({ persistJsonAccountingEntry }) =>
            Promise.all(real.map((e) => persistJsonAccountingEntry(mapEntryForPersist(e))))
        )
        .catch((err) => console.warn('[ledgerStore] dual-write upsert PG fallito', err));
}

export function updateTransactionCategory(txId: string, category: string): void {
    const ledger = getLedger();
    const tx = ledger.transactions.find((t) => t.id === txId);
    if (tx) {
        tx.category = category;
        saveLedger(ledger);
    }
}

function mapEntryForPersist(e: AccountingEntry) {
    return {
        id: e.id,
        date: e.date,
        description: e.description,
        dareAccount: e.dareAccount,
        avereAccount: e.avereAccount,
        amountCents: e.amountCents,
        vatAmountCents: e.vatAmountCents,
        invoiceReference: e.invoiceReference,
    };
}
