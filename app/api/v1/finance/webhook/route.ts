import { NextResponse } from 'next/server';
import { QontoProvider } from '@/lib/financial/providers/qonto';
import { MockBankProvider } from '@/lib/financial/providers/mock';
import { addTransaction } from '@/lib/financial/ledgerStore';
import { reconcileTransaction } from '@/lib/financial/reconciler';

export async function POST(request: Request) {
    try {
        const bodyText = await request.text();
        
        // Estrai gli header per la validazione della firma
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key] = value;
        });

        // Controlla se la firma indica un mock o se Qonto non è configurato
        const isMock = 
            headers['x-mock-provider'] === 'true' || 
            !process.env.QONTO_WEBHOOK_SECRET || 
            process.env.NODE_ENV !== 'production';

        const provider = isMock ? new MockBankProvider() : new QontoProvider();

        // Esegui il parsing e il mapping della transazione
        const transaction = provider.parseWebhookPayload(bodyText, headers);

        if (!transaction) {
            return NextResponse.json({ 
                ok: false, 
                error: 'Firma webhook non valida o payload malformato' 
            }, { status: 400 });
        }

        // 1. Persisti la transazione nel ledger locale
        addTransaction(transaction);

        // 2. Avvia la riconciliazione automatica con il DB e la scrittura in Prima Nota
        const reconciliation = await reconcileTransaction(transaction);

        return NextResponse.json({
            ok: true,
            transactionId: transaction.id,
            reconciled: reconciliation.isReconciled,
            result: reconciliation
        });
    } catch (error) {
        console.error('[Finance Webhook Route] Errore critico:', error);
        return NextResponse.json({ 
            ok: false, 
            error: error instanceof Error ? error.message : 'Errore interno' 
        }, { status: 500 });
    }
}
