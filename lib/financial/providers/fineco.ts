/**
 * Provider movimenti bancari FinecoBank (conto operativo FloreMoria).
 * Accetta webhook firmati (FINECO_* env) e payload generico banking per ingestione.
 */
import crypto from 'crypto';
import { BankProvider, BankTransaction } from '../types';
import { FLOREMORIA_FINECO_BANK } from '@/lib/financial/companyBankDetails';

export class FinecoBankProvider implements BankProvider {
    private webhookSecret: string;

    constructor() {
        this.webhookSecret =
            process.env.FINECO_WEBHOOK_SECRET?.trim() ||
            process.env.BANK_WEBHOOK_SECRET?.trim() ||
            '';
    }

    /** Verifica firma HMAC-SHA256 (header x-fineco-signature o x-bank-signature). */
    verifyWebhookSignature(body: string, headers: Record<string, string>): boolean {
        const signatureHeader =
            headers['x-fineco-signature'] ||
            headers['X-Fineco-Signature'] ||
            headers['x-bank-signature'] ||
            headers['X-Bank-Signature'] ||
            '';
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
            console.error('[FinecoBankProvider verifyWebhookSignature] Errore verifica firma:', error);
            return false;
        }
    }

    parseWebhookPayload(body: string, headers: Record<string, string>): BankTransaction | null {
        if (!this.verifyWebhookSignature(body, headers)) {
            console.warn('[FinecoBankProvider parseWebhookPayload] Firma webhook non valida o mancante.');
            if (process.env.NODE_ENV === 'production' && this.webhookSecret) {
                return null;
            }
        }

        try {
            const data = JSON.parse(body);
            const transaction = data.transaction || data;

            if (!transaction.id || transaction.amount_cents === undefined) {
                return null;
            }

            const isDebit = transaction.side === 'debit' || transaction.direction === 'debit';
            const amountCents = Math.abs(transaction.amount_cents) * (isDebit ? -1 : 1);

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
                counterpartyName: String(
                    transaction.counterparty_name || FLOREMORIA_FINECO_BANK.institute
                ),
                counterpartyIban: transaction.counterparty_iban
                    ? String(transaction.counterparty_iban)
                    : null,
                emittedAt: String(transaction.emitted_at || new Date().toISOString()),
                category: isDebit ? 'EXPENSE' : 'INCOME',
                rawData: transaction,
            };
        } catch (error) {
            console.error('[FinecoBankProvider parseWebhookPayload] Errore di parsing:', error);
            return null;
        }
    }

    async getTransactionHistory(options?: { limit?: number }): Promise<BankTransaction[]> {
        void options;
        return [];
    }
}

/** @deprecated Alias — usare FinecoBankProvider. */
export const QontoProvider = FinecoBankProvider;
