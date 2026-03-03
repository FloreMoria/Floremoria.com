import { NextResponse } from 'next/server';
import { checkAdminAuth } from '../auth';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
    if (!checkAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    if (!checkAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const data = await request.json();
        const newCategory = await prisma.category.create({
            data: {
                name: data.name,
                slug: data.slug,
                sortOrder: data.sortOrder || 0,
                isActive: data.isActive !== undefined ? data.isActive : true
            }
        });
        return NextResponse.json(newCategory, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
