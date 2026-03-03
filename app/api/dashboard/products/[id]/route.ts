import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const data = await request.json();
        const slug = data.slug || data.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const updateData: any = { ...data };
        if (updateData.basePriceCents !== undefined) updateData.basePriceCents = parseInt(updateData.basePriceCents, 10);
        if (data.name) updateData.slug = slug;

        const updatedProduct = await prisma.product.update({
            where: { id },
            data: updateData,
            include: { category: true }
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

        await prisma.product.delete({
            where: { id }
        });

        revalidatePath('/dashboard/products');
        revalidatePath('/dashboard/catalog');

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Delete product error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
