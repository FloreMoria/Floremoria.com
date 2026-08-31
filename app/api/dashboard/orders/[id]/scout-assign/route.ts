import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { assignScoutFloristToOrder } from '@/lib/orders/scoutAssignFlorist';

export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const rank = Number(body.rank) || 1;

    const result = await assignScoutFloristToOrder(id, rank);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      message === 'order_not_found' || message === 'scout_recommendation_not_found' ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
