import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { isDashboardAdminRole } from '@/lib/superAdmin';
import { hasValidAdminApiKeyHeader } from '@/lib/auth/verbaleSyncAuth';

async function requireOffersApiAuth(request: Request): Promise<NextResponse | null> {
    if (hasValidAdminApiKeyHeader(request.headers.get('x-admin-key'))) {
        return null;
    }
    const cookieStore = await cookies();
    const role = cookieStore.get('fm_user_role')?.value;
    if (isDashboardAdminRole(role)) {
        return null;
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const denied = await requireOffersApiAuth(request);
    if (denied) return denied;

    const resolvedParams = await context.params;
    try {
        const offer = await prisma.offer.findUnique({
            where: { id: resolvedParams.id },
        });
        if (!offer) return NextResponse.json({ error: 'Not Found' }, { status: 404 });
        return NextResponse.json(offer);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    const denied = await requireOffersApiAuth(request);
    if (denied) return denied;

    const resolvedParams = await context.params;
    try {
        const data = await request.json();
        const offer = await prisma.offer.update({
            where: { id: resolvedParams.id },
            data: {
                name: data.name,
                code: typeof data.code === 'string' ? data.code.trim().toUpperCase() : null,
                type: data.type,
                value: data.value,
                maxUses: typeof data.maxUses === 'number' && data.maxUses > 0 ? data.maxUses : null,
                startsAt: data.startsAt ? new Date(data.startsAt) : null,
                endsAt: data.endsAt ? new Date(data.endsAt) : null,
                isActive: data.isActive,
                rulesJson: data.rulesJson,
            },
        });
        return NextResponse.json(offer);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const denied = await requireOffersApiAuth(request);
    if (denied) return denied;

    const resolvedParams = await context.params;
    try {
        const data = await request.json();
        const offer = await prisma.offer.update({
            where: { id: resolvedParams.id },
            data: {
                isActive: Boolean(data?.isActive),
            },
        });
        return NextResponse.json(offer);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    const denied = await requireOffersApiAuth(request);
    if (denied) return denied;

    const resolvedParams = await context.params;
    try {
        await prisma.offer.update({
            where: { id: resolvedParams.id },
            data: { deletedAt: new Date() },
        });
        return new NextResponse(null, { status: 204 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
