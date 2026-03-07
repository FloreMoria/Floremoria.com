import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PUT(request: Request, context: any) {
    try {
        const { id } = await context.params;
        const body = await request.json();

        const { status } = body;

        if (!status) {
            return NextResponse.json({ error: 'Missing payment status' }, { status: 400 });
        }

        const updatedInvoice = await prisma.supplierInvoice.update({
            where: { id },
            data: { status }
        });

        return NextResponse.json(updatedInvoice);
    } catch (error) {
        console.error('Error updating supplier invoice:', error);
        return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }
}
