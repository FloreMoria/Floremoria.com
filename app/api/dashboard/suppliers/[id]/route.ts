import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PUT(request: Request, context: any) {
    try {
        const { id } = await context.params;
        const body = await request.json();

        // Remove structural properties that Prisma doesn't need for updates
        const { id: _, createdAt, updatedAt, deletedAt, ...updateData } = body;

        const supplier = await prisma.supplier.update({
            where: { id },
            data: updateData
        });

        return NextResponse.json(supplier);
    } catch (error) {
        console.error('Error updating supplier:', error);
        return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: any) {
    try {
        const { id } = await context.params;

        await prisma.supplier.update({
            where: { id },
            data: { deletedAt: new Date() }
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting supplier:', error);
        return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 });
    }
}
