import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/app/api/admin/auth';
import { resendVeraOrderNotifications } from '@/lib/vera/orderWorkflow/resendVeraOrderNotifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

        const result = await resendVeraOrderNotifications(orderNumber, {
            customer: body.customer !== false,
            florist: body.florist !== false,
            force: body.force === true,
        });

        return NextResponse.json(
            { success: result.ok, ...result },
            { status: result.ok ? 200 : 502 }
        );
    } catch (error) {
        console.error('[admin/resend-vera-order]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
