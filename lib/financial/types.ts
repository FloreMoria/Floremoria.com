export interface BankTransaction {
    id: string;
    amountCents: number; // Positivo per entrate, negativo per uscite
    currency: string;
    side: 'iban' | 'card' | 'sepa';
    status: 'completed' | 'pending' | 'failed';
    reference: string | null;
    counterpartyName: string;
    counterpartyIban?: string | null;
    emittedAt: string; // Data emissione in formato ISO
    category: string | null;
    rawData?: any;
}

export interface ReconciliationResult {
    isReconciled: boolean;
    orderId?: string | null;
    matchingScore: number; // Punteggio da 0 a 100
    type: 'STRIPE' | 'B2B_PARTNER' | 'DIRECT_SEPA' | 'EXPENSE_SAAS' | 'EXPENSE_FOREIGN' | 'UNRECONCILED';
    notes: string;
}

export interface AccountingEntry {
    id: string;
    date: string; // Formato YYYY-MM-DD
    description: string;
    dareAccount: string;
    avereAccount: string;
    amountCents: number;
    vatAmountCents: number;
    isForeignService: boolean;
    invoiceReference: string | null;
    status: 'DRAFT' | 'CONFIRMED';
}

export interface BankProvider {
    getTransactionHistory(options?: any): Promise<BankTransaction[]>;
    parseWebhookPayload(body: string, headers: Record<string, string>): BankTransaction | null;
    verifyWebhookSignature(body: string, headers: Record<string, string>): boolean;
}

export interface FinancialLedger {
    transactions: BankTransaction[];
    accountingEntries: AccountingEntry[];
    completedDeadlineIds?: string[];
    /** Override stato scadenziario: PENDING | PAID | ARCHIVED | DUE_SOON */
    deadlineStatusById?: Record<string, string>;
}

