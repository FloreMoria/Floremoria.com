import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { getLedger, addTransaction } from '@/lib/financial/ledgerStore';
import { reconcileTransaction, processManualOrders } from '@/lib/financial/reconciliation';
import { calculateFinancialStatements } from '@/lib/financial/statements';
import { getFinecoManualBalance } from '@/lib/financial/finecoBalance';
import { sumSaasForeignEurCents } from '@/lib/financial/saasForeignInvoices';
import {
    mergeDeadlineStateIntoLedger,
    migrateDeadlineStateFromLedgerFileIfNeeded,
    setDeadlineStatus,
    toggleDeadlineCompleted,
    type DeadlineStatus,
} from '@/lib/financial/financeDeadlineStore';

export const dynamic = 'force-dynamic';

async function ledgerWithNeonDeadlines() {
    const ledger = getLedger();
    // getLedger espone ancora le scadenze file in memoria per la migrazione one-shot.
    const deadlineState = await migrateDeadlineStateFromLedgerFileIfNeeded(ledger);
    return mergeDeadlineStateIntoLedger(ledger, deadlineState);
}

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const [ledger, statements, finecoBalance, saasTotalEurCents] = await Promise.all([
            ledgerWithNeonDeadlines(),
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
            const side = (body.side === 'card'
                ? 'card'
                : body.side === 'sepa'
                  ? 'sepa'
                  : 'iban') as 'iban' | 'card' | 'sepa';
            const reference = body.reference ? String(body.reference).trim() : null;
            const counterpartyName = body.counterpartyName
                ? String(body.counterpartyName).trim()
                : 'Test Partner';

            if (Number.isNaN(amountCents)) {
                return NextResponse.json(
                    { ok: false, error: 'Importo non valido' },
                    { status: 400 }
                );
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
                category: null,
            };

            addTransaction(transaction);
            const recResult = await reconcileTransaction(transaction);

            return NextResponse.json({
                ok: true,
                transaction,
                reconciliation: recResult,
                ledger: await ledgerWithNeonDeadlines(),
                statements: await calculateFinancialStatements(),
            });
        }

        if (action === 'process_manual_orders') {
            const count = await processManualOrders();
            return NextResponse.json({
                ok: true,
                processedCount: count,
                ledger: await ledgerWithNeonDeadlines(),
                statements: await calculateFinancialStatements(),
            });
        }

        if (action === 'toggle_deadline') {
            const deadlineId = String(body.deadlineId || '').trim();
            if (!deadlineId) {
                return NextResponse.json(
                    { ok: false, error: 'ID scadenza mancante' },
                    { status: 400 }
                );
            }

            const deadlineState = await toggleDeadlineCompleted(deadlineId);
            const ledger = mergeDeadlineStateIntoLedger(getLedger(), deadlineState);
            return NextResponse.json({
                ok: true,
                ledger,
                statements: await calculateFinancialStatements(),
            });
        }

        if (action === 'set_deadline_status') {
            const deadlineId = String(body.deadlineId || '').trim();
            const status = String(body.status || '').trim().toUpperCase();
            const allowed = new Set(['PENDING', 'DUE_SOON', 'PAID', 'ARCHIVED', 'SCADUTO']);
            if (!deadlineId || !allowed.has(status)) {
                return NextResponse.json(
                    { ok: false, error: 'deadlineId / status non validi' },
                    { status: 400 }
                );
            }
            const deadlineState = await setDeadlineStatus(
                deadlineId,
                status as DeadlineStatus
            );
            const ledger = mergeDeadlineStateIntoLedger(getLedger(), deadlineState);
            return NextResponse.json({
                ok: true,
                ledger,
                statements: await calculateFinancialStatements(),
            });
        }

        return NextResponse.json({ ok: false, error: 'Azione non supportata' }, { status: 400 });
    } catch (error) {
        console.error('[Finance API POST] Errore:', error);
        return NextResponse.json({ ok: false, error: 'Errore interno' }, { status: 500 });
    }
}
