import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PUT(request: Request, context: any) {
    try {
        const { id } = await context.params;
        const body = await request.json();

        // Remove structural properties that Prisma doesn't need for updates
        const { id: _, createdAt, updatedAt, deletedAt, ...updateData } = body;

        // TODO: In futuro, per i dati sensibili, implementare qui il salvataggio
        // di un AuditLog prima di eseguire l'update per mantenere lo snapshot.

        const partner = await prisma.partner.update({
            where: { id },
            data: {
                ...updateData,
                activeOrders: Number(updateData.activeOrders ?? 0),
                adminRating: Number(updateData.adminRating ?? 5)
            }
        });

        return NextResponse.json(partner);
    } catch (error) {
        console.error('Error updating partner:', error);
        return NextResponse.json({ error: 'Failed to update partner' }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: any) {
    try {
        const { id } = await context.params;

        await prisma.partner.update({
            where: { id },
            data: { deletedAt: new Date() }
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting partner:', error);
        return NextResponse.json({ error: 'Failed to delete partner' }, { status: 500 });
    }
}
