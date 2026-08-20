import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    getFinecoManualBalance,
    setFinecoManualBalance,
} from '@/lib/financial/finecoBalance';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    try {
        const balance = await getFinecoManualBalance();
        return NextResponse.json({ ok: true, balance });
    } catch (error) {
        console.error('[fineco-balance GET]', error);
        return NextResponse.json({ ok: false, error: 'Lettura saldo fallita' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    try {
        const body = await request.json();
        const euros = Number(body.balanceEuros ?? body.balance);
        if (!Number.isFinite(euros)) {
            return NextResponse.json({ ok: false, error: 'Importo non valido' }, { status: 400 });
        }
        const balanceCents =
            typeof body.balanceCents === 'number' && Number.isFinite(body.balanceCents)
                ? Math.round(body.balanceCents)
                : Math.round(euros * 100);

        const balance = await setFinecoManualBalance({
            balanceCents,
            note: body.note != null ? String(body.note) : null,
        });
        return NextResponse.json({ ok: true, balance });
    } catch (error) {
        console.error('[fineco-balance PUT]', error);
        return NextResponse.json({ ok: false, error: 'Salvataggio saldo fallito' }, { status: 500 });
    }
}
