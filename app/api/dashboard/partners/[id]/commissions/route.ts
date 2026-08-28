import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    getPartnerCommissionSummary,
    settlePartnerCommissionOrders,
} from '@/lib/financial/partnerCommissionRegister';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const summary = await getPartnerCommissionSummary(id);
    if (!summary) {
        return NextResponse.json({ ok: false, error: 'Partner non trovato.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, summary });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    let body: { action?: string; orderIds?: string[]; periodKey?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: 'JSON non valido.' }, { status: 400 });
    }

    if (body.action !== 'settle_pending') {
        return NextResponse.json({ ok: false, error: 'Azione non supportata.' }, { status: 400 });
    }

    const result = await settlePartnerCommissionOrders({
        partnerId: id,
        orderIds: body.orderIds,
        periodKey: body.periodKey,
    });

    return NextResponse.json({ ok: true, updated: result.updated });
}
