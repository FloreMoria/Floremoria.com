import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { getLedger, addTransaction, saveLedger } from '@/lib/financial/ledgerStore';
import { reconcileTransaction, processManualOrders } from '@/lib/financial/reconciler';
import { calculateFinancialStatements } from '@/lib/financial/statements';
import { getFinecoManualBalance } from '@/lib/financial/finecoBalance';
import { sumSaasForeignEurCents } from '@/lib/financial/saasForeignInvoices';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const ledger = getLedger();
        const [statements, finecoBalance, saasTotalEurCents] = await Promise.all([
            calculateFinancialStatements(),
            getFinecoManualBalance(),
            sumSaasForeignEurCents(),
        ]);
        return NextResponse.json({
            ok: true,
            ledger,
            statements,
            finecoBalance,
            saasTotalEurCents,
        });
    } catch (error) {
        console.error('[Finance API GET] Errore:', error);
        return NextResponse.json({ ok: false, error: 'Errore interno' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = await request.json();
        const action = String(body.action || '').trim();

        if (action === 'simulate_transaction') {
            const amountCents = Number(body.amountCents);
            const side = (body.side === 'card' ? 'card' : body.side === 'sepa' ? 'sepa' : 'iban') as 'iban' | 'card' | 'sepa';
            const reference = body.reference ? String(body.reference).trim() : null;
            const counterpartyName = body.counterpartyName ? String(body.counterpartyName).trim() : 'Test Partner';

            if (Number.isNaN(amountCents)) {
                return NextResponse.json({ ok: false, error: 'Importo non valido' }, { status: 400 });
            }

            const transaction = {
                id: `tx_sim_${Date.now()}`,
                amountCents,
                currency: 'EUR',
                side,
                status: 'completed' as const,
                reference,
                counterpartyName,
                counterpartyIban: body.counterpartyIban || null,
                emittedAt: new Date().toISOString(),
                category: null
            };

            // Ingesta transazione
            addTransaction(transaction);

            // Riconcilia
            const recResult = await reconcileTransaction(transaction);

            return NextResponse.json({ 
                ok: true, 
                transaction, 
                reconciliation: recResult,
                ledger: getLedger(),
                statements: await calculateFinancialStatements()
            });
        }

        if (action === 'process_manual_orders') {
            const count = await processManualOrders();
            return NextResponse.json({ 
                ok: true, 
                processedCount: count,
                ledger: getLedger(),
                statements: await calculateFinancialStatements()
            });
        }

        if (action === 'toggle_deadline') {
            const deadlineId = String(body.deadlineId || '').trim();
            if (!deadlineId) {
                return NextResponse.json({ ok: false, error: 'ID scadenza mancante' }, { status: 400 });
            }

            const currentLedger = getLedger();
            if (!currentLedger.completedDeadlineIds) {
                currentLedger.completedDeadlineIds = [];
            }

            const index = currentLedger.completedDeadlineIds.indexOf(deadlineId);
            if (index > -1) {
                currentLedger.completedDeadlineIds.splice(index, 1);
            } else {
                currentLedger.completedDeadlineIds.push(deadlineId);
            }

            saveLedger(currentLedger);
            return NextResponse.json({ 
                ok: true, 
                ledger: currentLedger,
                statements: await calculateFinancialStatements()
            });
        }

        if (action === 'set_deadline_status') {
            const deadlineId = String(body.deadlineId || '').trim();
            const status = String(body.status || '').trim().toUpperCase();
            const allowed = new Set(['PENDING', 'DUE_SOON', 'PAID', 'ARCHIVED']);
            if (!deadlineId || !allowed.has(status)) {
                return NextResponse.json(
                    { ok: false, error: 'deadlineId / status non validi' },
                    { status: 400 }
                );
            }
            const currentLedger = getLedger();
            if (!currentLedger.deadlineStatusById) currentLedger.deadlineStatusById = {};
            if (!currentLedger.completedDeadlineIds) currentLedger.completedDeadlineIds = [];
            currentLedger.deadlineStatusById[deadlineId] = status;
            const idx = currentLedger.completedDeadlineIds.indexOf(deadlineId);
            if (status === 'PAID' || status === 'ARCHIVED') {
                if (idx < 0) currentLedger.completedDeadlineIds.push(deadlineId);
            } else if (idx > -1) {
                currentLedger.completedDeadlineIds.splice(idx, 1);
            }
            saveLedger(currentLedger);
            return NextResponse.json({
                ok: true,
                ledger: currentLedger,
                statements: await calculateFinancialStatements(),
            });
        }

        return NextResponse.json({ ok: false, error: 'Azione non supportata' }, { status: 400 });
    } catch (error) {
        console.error('[Finance API POST] Errore:', error);
        return NextResponse.json({ ok: false, error: 'Errore interno' }, { status: 500 });
    }
}
