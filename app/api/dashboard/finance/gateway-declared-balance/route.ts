/**
 * GET/PUT saldi wallet gateway dichiarati (C13).
 * Solo admin — stesso modello di fineco-balance.
 */

import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    getPaypalDeclaredBalance,
    getStripeDeclaredBalance,
    setPaypalDeclaredBalance,
    setStripeDeclaredBalance,
} from '@/lib/financial/gatewayDeclaredBalance';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    try {
        const [stripe, paypal] = await Promise.all([
            getStripeDeclaredBalance(),
            getPaypalDeclaredBalance(),
        ]);
        return NextResponse.json({ ok: true, stripe, paypal });
    } catch (error) {
        console.error('[gateway-declared-balance GET]', error);
        return NextResponse.json({ ok: false, error: 'Lettura saldi fallita' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    try {
        const body = await request.json();
        const gateway = String(body.gateway || '').toUpperCase();
        if (gateway !== 'STRIPE' && gateway !== 'PAYPAL') {
            return NextResponse.json(
                { ok: false, error: 'gateway must be STRIPE or PAYPAL' },
                { status: 400 }
            );
        }
        const euros = Number(body.balanceEuros ?? body.balance);
        const balanceCents =
            typeof body.balanceCents === 'number' && Number.isFinite(body.balanceCents)
                ? Math.round(body.balanceCents)
                : Number.isFinite(euros)
                  ? Math.round(euros * 100)
                  : NaN;
        if (!Number.isFinite(balanceCents)) {
            return NextResponse.json({ ok: false, error: 'Importo non valido' }, { status: 400 });
        }
        const saved =
            gateway === 'STRIPE'
                ? await setStripeDeclaredBalance({
                      balanceCents,
                      asOf: body.asOf != null ? String(body.asOf) : undefined,
                      note: body.note != null ? String(body.note) : null,
                  })
                : await setPaypalDeclaredBalance({
                      balanceCents,
                      asOf: body.asOf != null ? String(body.asOf) : undefined,
                      note: body.note != null ? String(body.note) : null,
                  });
        return NextResponse.json({ ok: true, gateway, balance: saved });
    } catch (error) {
        console.error('[gateway-declared-balance PUT]', error);
        return NextResponse.json({ ok: false, error: 'Salvataggio saldo fallito' }, { status: 500 });
    }
}
