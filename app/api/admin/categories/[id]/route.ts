import { NextResponse } from 'next/server';
import { checkAdminAuth } from '../../auth';
import prisma from '@/lib/prisma';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    if (!checkAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolvedParams = await context.params;
    try {
        const category = await prisma.category.findUnique({
            where: { id: resolvedParams.id }
        });
        if (!category) return NextResponse.json({ error: 'Not Found' }, { status: 404 });
        return NextResponse.json(category);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    if (!checkAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolvedParams = await context.params;
    try {
        const data = await request.json();

        // TODO: In futuro, per i dati sensibili, implementare qui il salvataggio
        // di un AuditLog prima di eseguire l'update per mantenere lo snapshot.

        const category = await prisma.category.update({
            where: { id: resolvedParams.id },
            data: {
                name: data.name,
                slug: data.slug,
                sortOrder: data.sortOrder,
                isActive: data.isActive
            }
        });
        return NextResponse.json(category);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    if (!checkAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolvedParams = await context.params;
    try {
        await prisma.category.update({
            where: { id: resolvedParams.id },
            data: { deletedAt: new Date() }
        });
        return new NextResponse(null, { status: 204 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
