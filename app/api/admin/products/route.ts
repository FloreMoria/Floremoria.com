import { NextResponse } from 'next/server';
import { checkAdminAuth } from '../auth';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
    if (!checkAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const products = await prisma.product.findMany({
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            include: { images: true }
        });
        return NextResponse.json(products);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    if (!checkAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const data = await request.json();
        const newProduct = await prisma.product.create({
            data: {
                categoryId: data.categoryId,
                name: data.name,
                slug: data.slug,
                shortDescription: data.shortDescription,
                description: data.description,
                basePriceCents: data.basePriceCents,
                currency: data.currency || 'EUR',
                isActive: data.isActive !== undefined ? data.isActive : true,
                sortOrder: data.sortOrder || 0
            },
            include: { images: true }
        });
        return NextResponse.json(newProduct, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
