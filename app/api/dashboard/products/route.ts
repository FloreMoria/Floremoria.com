import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export async function GET() {
    try {
        const products = await prisma.product.findMany({
            where: { deletedAt: null },
            include: { category: true },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(products);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const data = await request.json();
        const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const newProduct = await prisma.product.create({
            data: {
                categoryId: data.categoryId,
                name: data.name,
                slug: slug,
                shortDescription: data.shortDescription || null,
                description: data.description || null,
                basePriceCents: parseInt(data.basePriceCents, 10),
                currency: data.currency || 'EUR',
                isBouquet: data.isBouquet !== undefined ? data.isBouquet : true,
                mediaUrl: data.mediaUrl || null,
                isActive: data.isActive !== undefined ? data.isActive : true
            },
            include: { category: true }
        });

        // Forza la rigenerazione della cache dove appare il catalogo
        revalidatePath('/dashboard/products');
        revalidatePath('/dashboard/catalog');

        return NextResponse.json(newProduct, { status: 201 });
    } catch (e: any) {
        console.error('Create product error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
