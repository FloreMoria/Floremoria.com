import { NextResponse } from 'next/server';
import { FinecoBankProvider } from '@/lib/financial/providers/fineco';
import { addTransaction } from '@/lib/financial/ledgerStore';
import { reconcileTransaction } from '@/lib/financial/reconciliation';

/**
 * Webhook movimenti bancari Fineco — solo firma HMAC valida.
 * Perché: x-mock-provider / ambient non-prod permettevano scritture contabili non autenticate.
 */
export async function POST(request: Request) {
    try {
        const secret =
            process.env.FINECO_WEBHOOK_SECRET?.trim() ||
            process.env.BANK_WEBHOOK_SECRET?.trim() ||
            '';
        if (!secret) {
            console.error('[Finance Webhook] FINECO_WEBHOOK_SECRET / BANK_WEBHOOK_SECRET assente');
            return NextResponse.json(
                { ok: false, error: 'Webhook banking non configurato' },
                { status: 503 }
            );
        }

        const bodyText = await request.text();
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key] = value;
        });

        // Ignora qualsiasi tentativo di bypass (x-mock-provider non è più accettato).
        if (headers['x-mock-provider'] === 'true') {
            return NextResponse.json(
                { ok: false, error: 'Bypass mock non consentito' },
                { status: 403 }
            );
        }

        const provider = new FinecoBankProvider();
        if (!provider.verifyWebhookSignature(bodyText, headers)) {
            return NextResponse.json(
                { ok: false, error: 'Firma webhook non valida o mancante' },
                { status: 401 }
            );
        }

        const transaction = provider.parseWebhookPayload(bodyText, headers);
        if (!transaction) {
            return NextResponse.json(
                { ok: false, error: 'Payload webhook malformato' },
                { status: 400 }
            );
        }

        addTransaction(transaction);
        const reconciliation = await reconcileTransaction(transaction);

        return NextResponse.json({
            ok: true,
            transactionId: transaction.id,
            reconciled: reconciliation.isReconciled,
            result: reconciliation,
        });
    } catch (error) {
        console.error('[Finance Webhook Route] Errore critico:', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Errore interno',
            },
            { status: 500 }
        );
    }
}
