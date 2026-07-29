import { BankProvider, BankTransaction } from '../types';

export class MockBankProvider implements BankProvider {
    verifyWebhookSignature(body: string, headers: Record<string, string>): boolean {
        void body;
        void headers;
        // In modalità mock, la firma è sempre valida per test locali rapidi
        return true;
    }

    parseWebhookPayload(body: string, headers: Record<string, string>): BankTransaction | null {
        void headers;
        try {
            const data = JSON.parse(body);
            const isDebit = data.side === 'debit';
            const amountCents = Math.abs(data.amountCents) * (isDebit ? -1 : 1);

            return {
                id: data.id || `tx_mock_${Date.now()}`,
                amountCents,
                currency: data.currency || 'EUR',
                side: data.side === 'card' ? 'card' : data.side === 'sepa' ? 'sepa' : 'iban',
                status: 'completed',
                reference: data.reference ? String(data.reference).trim() : null,
                counterpartyName: data.counterpartyName || 'Mock Partner S.r.l.',
                counterpartyIban: data.counterpartyIban || null,
                emittedAt: data.emittedAt || new Date().toISOString(),
                category: data.category || null,
                rawData: data,
            };
        } catch (error) {
            console.error('[MockBankProvider parseWebhookPayload] Errore di parsing:', error);
            return null;
        }
    }

    async getTransactionHistory(options?: { limit?: number }): Promise<BankTransaction[]> {
        void options;
        return [
            {
                id: 'tx_mock_1',
                amountCents: 15000,
                currency: 'EUR',
                side: 'sepa',
                status: 'completed',
                reference: 'STRIPE PAYOUT po_mock_1',
                counterpartyName: 'Stripe Payments UK Ltd',
                emittedAt: new Date().toISOString(),
                category: 'STRIPE',
            },
            {
                id: 'tx_mock_2',
                amountCents: -12000,
                currency: 'EUR',
                side: 'iban',
                status: 'completed',
                reference: 'COMPETENZE FIORISTA MILANO ORD PT-MI-26-001',
                counterpartyName: 'Milano Fioriti B2B',
                emittedAt: new Date().toISOString(),
                category: 'EXPENSE_PARTNER',
            }
        ];
    }
}
