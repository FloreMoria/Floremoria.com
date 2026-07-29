import crypto from 'crypto';
import { BankProvider, BankTransaction } from '../types';

export class QontoProvider implements BankProvider {
    private organizationId: string;
    private secretKey: string;
    private webhookSecret: string;

    constructor() {
        this.organizationId = process.env.QONTO_ORGANIZATION_ID || '';
        this.secretKey = process.env.QONTO_SECRET_KEY || '';
        this.webhookSecret = process.env.QONTO_WEBHOOK_SECRET || '';
    }

    /**
     * Verifica la validità della firma HMAC-SHA256 sui webhook inviati da Qonto.
     */
    verifyWebhookSignature(body: string, headers: Record<string, string>): boolean {
        // Leggi l'header in modo case-insensitive
        const signatureHeader = headers['x-qonto-signature'] || headers['X-Qonto-Signature'] || '';
        if (!signatureHeader || !this.webhookSecret) {
            return false;
        }

        try {
            const computedSignature = crypto
                .createHmac('sha256', this.webhookSecret)
                .update(body)
                .digest('hex');

            const computedBuf = Buffer.from(computedSignature, 'hex');
            const headerBuf = Buffer.from(signatureHeader, 'hex');

            if (computedBuf.length !== headerBuf.length) {
                return false;
            }

            return crypto.timingSafeEqual(computedBuf, headerBuf);
        } catch (error) {
            console.error('[QontoProvider verifyWebhookSignature] Errore verifica firma:', error);
            return false;
        }
    }

    /**
     * Esegue il parsing di un webhook nativo Qonto e lo mappa su BankTransaction.
     * Struttura payload Qonto tipico:
     * {
     *   "id": "trans_12345",
     *   "amount": 150.00,
     *   "amount_cents": 15000,
     *   "currency": "EUR",
     *   "side": "credit" | "debit",
     *   "operation_type": "income" | "transfer" | "card",
     *   "status": "completed",
     *   "reference": "CAUSALE ORDINE PT-MI-26-001",
     *   "counterparty_name": "Paolo Rossi",
     *   "counterparty_iban": "IT123...",
     *   "emitted_at": "2026-07-29T11:45:00.000Z"
     * }
     */
    parseWebhookPayload(body: string, headers: Record<string, string>): BankTransaction | null {
        // Prima verifichiamo la firma
        if (!this.verifyWebhookSignature(body, headers)) {
            console.warn('[QontoProvider parseWebhookPayload] Firma del webhook non valida o mancante.');
            // Se siamo in sviluppo e manca la chiave webhook, lasciamo procedere per flessibilità locale
            if (process.env.NODE_ENV === 'production') {
                return null;
            }
        }

        try {
            const data = JSON.parse(body);
            // Qonto invia l'evento nidificato o diretto a seconda della versione API
            const transaction = data.transaction || data;

            if (!transaction.id || transaction.amount_cents === undefined) {
                return null;
            }

            // Calcoliamo l'amountCents comprensivo di segno (positivo = entrate/credit, negativo = uscite/debit)
            const isDebit = transaction.side === 'debit' || transaction.direction === 'debit';
            const amountCents = Math.abs(transaction.amount_cents) * (isDebit ? -1 : 1);

            // Mappiamo il side sul nostro tipo unificato ('iban' | 'card' | 'sepa')
            let side: 'iban' | 'card' | 'sepa' = 'iban';
            const opType = String(transaction.operation_type || '').toLowerCase();
            if (opType.includes('card')) {
                side = 'card';
            } else if (opType.includes('sepa') || opType.includes('direct')) {
                side = 'sepa';
            }

            return {
                id: String(transaction.id),
                amountCents,
                currency: String(transaction.currency || 'EUR'),
                side,
                status: transaction.status === 'completed' ? 'completed' : 'pending',
                reference: transaction.reference ? String(transaction.reference).trim() : null,
                counterpartyName: String(transaction.counterparty_name || 'Controparte sconosciuta'),
                counterpartyIban: transaction.counterparty_iban ? String(transaction.counterparty_iban) : null,
                emittedAt: String(transaction.emitted_at || new Date().toISOString()),
                category: isDebit ? 'EXPENSE' : 'INCOME',
                rawData: transaction,
            };
        } catch (error) {
            console.error('[QontoProvider parseWebhookPayload] Errore di parsing del body:', error);
            return null;
        }
    }

    /**
     * API Polling (stub/implementazione opzionale per storico bancario)
     */
    async getTransactionHistory(options?: { limit?: number }): Promise<BankTransaction[]> {
        void options;
        // In un'integrazione reale, questo metodo farebbe una fetch verso https://thirdparty.qonto.co/v2/transactions
        // usando l'Organization ID e Secret Key negli header.
        return [];
    }
}
