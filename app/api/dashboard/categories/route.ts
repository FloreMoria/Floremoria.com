import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export async function GET() {
    try {
        const categories = await prisma.category.findMany({
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' }
        });
        return NextResponse.json(categories);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const data = await request.json();
        const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const newCat = await prisma.category.create({
            data: {
                name: data.name,
                slug: slug,
                isActive: data.isActive !== undefined ? data.isActive : true
            }
        });

        // Forza la rigenerazione
        revalidatePath('/dashboard/products');

        return NextResponse.json(newCat, { status: 201 });
    } catch (e: any) {
        console.error('Create category error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
