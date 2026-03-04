import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id, createdAt, updatedAt, deletedAt, ...data } = body;

        const supplier = await prisma.supplier.create({
            data: data
        });

        return NextResponse.json(supplier);
    } catch (error) {
        console.error('Error creating supplier:', error);
        return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
    }
}
