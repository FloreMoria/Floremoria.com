import * as fs from 'fs';
import * as path from 'path';
import { BankTransaction, AccountingEntry, FinancialLedger } from './types';

const IS_VERCEL = process.env.VERCEL === '1';
const LEDGER_PATH = IS_VERCEL 
    ? path.join('/tmp', 'financial_ledger.json') 
    : path.join(process.cwd(), 'financial_ledger.json');

const DEFAULT_LEDGER: FinancialLedger = {
    transactions: [
        {
            id: 'tx_qonto_001',
            amountCents: 45000, // +450.00 EUR
            currency: 'EUR',
            side: 'iban',
            status: 'completed',
            reference: 'PAGAMENTO ORDINE PT-MI-26-001',
            counterpartyName: 'Milano Fioriti B2B',
            counterpartyIban: 'IT99A0123456789012345678901',
            emittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 giorni fa
            category: 'B2B_PARTNER',
        },
        {
            id: 'tx_qonto_002',
            amountCents: 9800, // +98.00 EUR (Stripe payout)
            currency: 'EUR',
            side: 'sepa',
            status: 'completed',
            reference: 'STRIPE PAYOUT po_12345',
            counterpartyName: 'Stripe Payments UK Ltd',
            counterpartyIban: null,
            emittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 giorni fa
            category: 'STRIPE',
        },
        {
            id: 'tx_qonto_003',
            amountCents: -2000, // -20.00 EUR
            currency: 'EUR',
            side: 'card',
            status: 'completed',
            reference: 'CURSOR SH*P ANYSPHERE',
            counterpartyName: 'Anysphere Inc.',
            emittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            category: 'EXPENSE_SAAS',
        },
        {
            id: 'tx_qonto_004',
            amountCents: -5000, // -50.00 EUR
            currency: 'EUR',
            side: 'card',
            status: 'completed',
            reference: 'ANTIGRAVITY AI GOOGLE DEEPMIND API',
            counterpartyName: 'Google Ireland Limited',
            emittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            category: 'EXPENSE_SAAS',
        },
        {
            id: 'tx_qonto_005',
            amountCents: -1250, // -12.50 EUR
            currency: 'EUR',
            side: 'card',
            status: 'completed',
            reference: 'GOOGLE *CLOUD STORAGE FLOREMORIA',
            counterpartyName: 'Google Ireland Limited',
            emittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            category: 'EXPENSE_SAAS',
        },
        {
            id: 'tx_qonto_006',
            amountCents: -12000, // -120.00 EUR
            currency: 'EUR',
            side: 'iban',
            status: 'completed',
            reference: 'COMPETENZE E POSA BERGAMO ORD PT-BG-26-003',
            counterpartyName: 'Fiorista Bergamo S.r.l.',
            counterpartyIban: 'IT88B0987654321098765432109',
            emittedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
            category: 'EXPENSE_PARTNER',
        }
    ],
    accountingEntries: [
        // Prima Nota seed iniziale già riconciliata per dimostrazione
        {
            id: 'entry_001_gross',
            date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            description: 'Incasso bonifico Milano Fioriti B2B - Riferimento PT-MI-26-001',
            dareAccount: '50100 - Banca Qonto',
            avereAccount: '60100 - Ricavi da Vendite',
            amountCents: 45000,
            vatAmountCents: 8115, // 22% VAT scorporata su fiori (es. €368.85 imponibile, €81.15 iva)
            isForeignService: false,
            invoiceReference: 'B2B-2026-001',
            status: 'CONFIRMED'
        },
        {
            id: 'entry_002_gross',
            date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            description: 'Stripe Payout po_12345 - Incasso Lordo Clienti',
            dareAccount: '50100 - Banca Qonto',
            avereAccount: '60100 - Ricavi da Vendite',
            amountCents: 10000,
            vatAmountCents: 1802,
            isForeignService: false,
            invoiceReference: 'REC-STRIPE-002',
            status: 'CONFIRMED'
        },
        {
            id: 'entry_002_fees',
            date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            description: 'Trattenuta commissioni Stripe su payout po_12345',
            dareAccount: '70200 - Commissioni Stripe',
            avereAccount: '50100 - Banca Qonto',
            amountCents: 200,
            vatAmountCents: 0, // Senza IVA (esente art. 10 o reverse charge registrato a parte)
            isForeignService: true,
            invoiceReference: 'FEES-STRIPE-002',
            status: 'CONFIRMED'
        },
        {
            id: 'entry_003',
            date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            description: 'Spesa abbonamento Cursor SaaS - Anysphere Inc. (Reverse Charge)',
            dareAccount: '70300 - Software SaaS (Estero)',
            avereAccount: '50100 - Banca Qonto',
            amountCents: 2000,
            vatAmountCents: 0,
            isForeignService: true,
            invoiceReference: 'INV-CURSOR-551',
            status: 'CONFIRMED'
        }
    ]
};

// Funzione di utilità per leggere il ledger in modo sicuro
export function getLedger(): FinancialLedger {
    try {
        if (!fs.existsSync(LEDGER_PATH)) {
            saveLedger(DEFAULT_LEDGER);
            return DEFAULT_LEDGER;
        }
        const raw = fs.readFileSync(LEDGER_PATH, 'utf-8');
        return JSON.parse(raw) as FinancialLedger;
    } catch (error) {
        console.error('[ledgerStore getLedger] Errore di lettura file ledger, restituisco default.', error);
        return DEFAULT_LEDGER;
    }
}

// Funzione di utilità per salvare il ledger in modo atomico (scrive su temp e rinomina)
export function saveLedger(ledger: FinancialLedger): void {
    const tempPath = `${LEDGER_PATH}.tmp`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(ledger, null, 4), 'utf-8');
        fs.renameSync(tempPath, LEDGER_PATH);
    } catch (error) {
        console.error('[ledgerStore saveLedger] Errore di salvataggio file ledger', error);
        if (fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch {}
        }
        throw error;
    }
}

// Aggiungere una singola transazione (evitando duplicati per ID)
export function addTransaction(transaction: BankTransaction): void {
    const ledger = getLedger();
    const exists = ledger.transactions.some(tx => tx.id === transaction.id);
    if (!exists) {
        ledger.transactions.push(transaction);
        saveLedger(ledger);
    }
}

// Aggiungere una o più scritture di Prima Nota
export function addAccountingEntries(entries: AccountingEntry[]): void {
    const ledger = getLedger();
    for (const entry of entries) {
        const exists = ledger.accountingEntries.some(e => e.id === entry.id);
        if (!exists) {
            ledger.accountingEntries.push(entry);
        }
    }
    saveLedger(ledger);
}

// Riconciliare un movimento esistente aggiornandone lo stato o le note
export function updateTransactionCategory(txId: string, category: string): void {
    const ledger = getLedger();
    const tx = ledger.transactions.find(t => t.id === txId);
    if (tx) {
        tx.category = category;
        saveLedger(ledger);
    }
}
