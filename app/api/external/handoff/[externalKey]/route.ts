import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { PartnerExternalOrderPayload } from '@/lib/partnerExternalOrderData';

type RouteContext = { params: Promise<{ externalKey: string }> };

/** Lettura pubblica per il browser checkout (la chiave è un UUID segreto a vita breve). */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
    const { externalKey } = await context.params;
    if (!externalKey || externalKey.length > 80) {
        return NextResponse.json({ error: 'Chiave non valida.' }, { status: 400 });
    }

    const row = await prisma.partnerHandoffSession.findUnique({
        where: { externalKey },
    });
    if (!row) {
        return NextResponse.json({ error: 'Sessione non trovata.' }, { status: 404 });
    }
    if (row.expiresAt.getTime() < Date.now()) {
        return NextResponse.json({ error: 'Sessione scaduta.' }, { status: 410 });
    }

    const payload = row.payload as PartnerExternalOrderPayload;
    return NextResponse.json({
        externalKey: row.externalKey,
        expiresAt: row.expiresAt.toISOString(),
        partnerId: row.partnerId,
        payload,
    });
}
