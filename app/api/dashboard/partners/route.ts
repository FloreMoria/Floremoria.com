import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id, createdAt, updatedAt, deletedAt, ...data } = body;

        const partner = await prisma.partner.create({
            data: {
                ...data,
                activeOrders: Number(data.activeOrders || 0),
                adminRating: Number(data.adminRating || 5)
            }
        });

        return NextResponse.json(partner);
    } catch (error) {
        console.error('Error creating partner:', error);
        return NextResponse.json({ error: 'Failed to create partner' }, { status: 500 });
    }
}
