import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    acceptPaymentOrderLink,
    buildPaymentOrderWorkList,
} from '@/lib/financial/paymentOrderWorkList';

export const dynamic = 'force-dynamic';

/** Lista di lavoro C11: pagamenti senza ordine / ordini senza pagamento + proposte. */
export async function GET(req: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const yearParam = req.nextUrl.searchParams.get('year');
        const year = yearParam ? Number(yearParam) : new Date().getFullYear();
        if (!Number.isFinite(year) || year < 2020 || year > 2100) {
            return NextResponse.json({ ok: false, error: 'year non valido' }, { status: 400 });
        }
        const data = await buildPaymentOrderWorkList(year);
        return NextResponse.json({ ok: true, data });
    } catch (e) {
        console.error('[payment-order-work-list GET]', e);
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : 'Errore' },
            { status: 500 }
        );
    }
}

/** Accetta una proposta di collegamento pagamento↔ordine (nessun auto-link). */
export async function POST(req: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = (await req.json()) as {
            transactionId?: string;
            channel?: string;
            orderId?: string;
        };
        if (!body.transactionId?.trim() || !body.orderId?.trim()) {
            return NextResponse.json(
                { ok: false, error: 'transactionId e orderId obbligatori' },
                { status: 400 }
            );
        }
        const result = await acceptPaymentOrderLink({
            transactionId: body.transactionId.trim(),
            channel: (body.channel || '').trim() || 'unknown',
            orderId: body.orderId.trim(),
        });
        if (!result.ok) {
            return NextResponse.json(result, { status: 409 });
        }
        return NextResponse.json(result);
    } catch (e) {
        console.error('[payment-order-work-list POST]', e);
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : 'Errore' },
            { status: 500 }
        );
    }
}
