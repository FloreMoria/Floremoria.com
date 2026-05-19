import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { buildProductUpdateData } from '@/lib/dashboardProductApi';

const prisma = new PrismaClient();

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const data = await request.json();
        const updateData = buildProductUpdateData(data);

        const updatedProduct = await prisma.product.update({
            where: { id },
            data: updateData,
            include: {
                category: true,
                images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            },
        });

        revalidatePath('/dashboard/products');
        revalidatePath('/dashboard/catalog');

        return NextResponse.json(updatedProduct);
    } catch (e: any) {
        console.error('Update product error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;

        await prisma.product.update({
            where: { id },
            data: { deletedAt: new Date() }
        });

        revalidatePath('/dashboard/products');
        revalidatePath('/dashboard/catalog');

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Delete product error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
