import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/app/api/admin/auth';
import { backfillOrderChatLog } from '@/lib/vera/orderWorkflow/backfillOrderChatLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
    if (!checkAdminAuth(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber.trim() : '';
        if (!orderNumber) {
            return NextResponse.json({ error: 'Campo orderNumber obbligatorio.' }, { status: 400 });
        }

        const result = await backfillOrderChatLog(orderNumber);
        return NextResponse.json(
            { success: result.ok, ...result },
            { status: result.ok ? 200 : 404 }
        );
    } catch (error) {
        console.error('[admin/backfill-order-chat]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
