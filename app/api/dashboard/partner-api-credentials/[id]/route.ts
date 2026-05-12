import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

/** Revoca credenziale (non elimina lo storico). */
export async function PATCH(request: Request, context: Ctx) {
    try {
        const { id } = await context.params;
        if (!id) {
            return NextResponse.json({ error: 'Id mancante.' }, { status: 400 });
        }
        const body = await request.json().catch(() => ({}));
        if (body.action !== 'revoke') {
            return NextResponse.json({ error: 'Azione non supportata (usa action: "revoke").' }, { status: 400 });
        }

        const row = await prisma.partnerApiCredential.findUnique({ where: { id } });
        if (!row) {
            return NextResponse.json({ error: 'Credenziale non trovata.' }, { status: 404 });
        }

        const updated = await prisma.partnerApiCredential.update({
            where: { id },
            data: {
                isActive: false,
                revokedAt: new Date(),
            },
            include: {
                partner: { select: { id: true, shopName: true, uniqueCode: true } },
            },
        });

        return NextResponse.json({
            id: updated.id,
            isActive: updated.isActive,
            revokedAt: updated.revokedAt?.toISOString() ?? null,
            partner: updated.partner,
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Revoca fallita.' }, { status: 500 });
    }
}
