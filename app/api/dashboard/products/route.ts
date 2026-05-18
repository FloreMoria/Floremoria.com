import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { buildProductUpdateData } from '@/lib/dashboardProductApi';

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
        const normalized = buildProductUpdateData(data);
        const slug =
            (typeof normalized.slug === 'string' && normalized.slug) ||
            String(data.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const newProduct = await prisma.product.create({
            data: {
                categoryId: String(data.categoryId),
                name: String(data.name),
                slug,
                shortDescription: (normalized.shortDescription as string | null) ?? null,
                description: (normalized.description as string | null) ?? null,
                basePriceCents: parseInt(String(data.basePriceCents), 10),
                currency: data.currency || 'EUR',
                isBouquet: normalized.isBouquet !== undefined ? Boolean(normalized.isBouquet) : true,
                mediaUrl: (normalized.mediaUrl as string | null) ?? null,
                isActive: normalized.isActive !== undefined ? Boolean(normalized.isActive) : true,
            },
            include: {
                category: true,
                images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            },
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
