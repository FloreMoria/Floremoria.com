import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PUT(request: Request, context: any) {
    try {
        const { id } = await context.params;
        const body = await request.json();

        // Extract partnerPaymentStatus
        const { partnerPaymentStatus } = body;

        if (!partnerPaymentStatus) {
            return NextResponse.json({ error: 'Missing payment status' }, { status: 400 });
        }

        const updatedOrder = await prisma.order.update({
            where: { id },
            data: { partnerPaymentStatus }
        });

        return NextResponse.json(updatedOrder);
    } catch (error) {
        console.error('Error updating order:', error);
        return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }
}
