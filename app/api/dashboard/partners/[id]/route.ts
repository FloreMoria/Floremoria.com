import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generatePartnerCode } from '@/lib/codeGenerator';

export async function PUT(request: Request, context: any) {
    try {
        const { id } = await context.params;
        const body = await request.json();

        // Remove structural properties that Prisma doesn't need for updates
        const { id: _, createdAt, updatedAt, deletedAt, ...updateData } = body;

        let uniqueCode = updateData.uniqueCode;

        // Fetch original to compare province if we need to regenerate
        const original = await prisma.partner.findUnique({ where: { id } });

        if (!uniqueCode && original && !original.uniqueCode) {
            uniqueCode = await generatePartnerCode(updateData.province || original.province);
        } else if (updateData.province && original && original.province !== updateData.province) {
            // Re-generate if province changes
            uniqueCode = await generatePartnerCode(updateData.province);
        }

        const dataToUpdate = {
            ...updateData,
            activeOrders: Number(updateData.activeOrders ?? 0),
            adminRating: Number(updateData.adminRating ?? 5)
        };

        if (uniqueCode) {
            dataToUpdate.uniqueCode = uniqueCode;
        }

        const partner = await prisma.partner.update({
            where: { id },
            data: dataToUpdate
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
