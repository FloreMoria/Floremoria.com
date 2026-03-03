import { NextResponse } from 'next/server';
import { checkAdminAuth } from '../auth';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
    if (!checkAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const offers = await prisma.offer.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(offers);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    if (!checkAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const data = await request.json();
        const newOffer = await prisma.offer.create({
            data: {
                name: data.name,
                code: data.code,
                type: data.type,
                value: data.value,
                startsAt: data.startsAt ? new Date(data.startsAt) : null,
                endsAt: data.endsAt ? new Date(data.endsAt) : null,
                isActive: data.isActive !== undefined ? data.isActive : true,
                rulesJson: data.rulesJson || null
            }
        });
        return NextResponse.json(newOffer, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
