import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
    generatePartnerApiPublicId,
    generatePartnerApiSecretPlain,
    hashPartnerApiSecret,
} from '@/lib/partnerApiSecret';

export async function GET() {
    try {
        const rows = await prisma.partnerApiCredential.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                partner: { select: { id: true, shopName: true, uniqueCode: true } },
            },
        });
        return NextResponse.json(
            rows.map((r) => ({
                id: r.id,
                label: r.label,
                publicId: r.publicId,
                isActive: r.isActive,
                createdAt: r.createdAt.toISOString(),
                revokedAt: r.revokedAt?.toISOString() ?? null,
                lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
                partner: r.partner,
            }))
        );
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Lettura credenziali fallita.' }, { status: 500 });
    }
}

type CreateBody = { partnerId?: string; label?: string };

/** Crea credenziale; il **segreto** è restituito una sola volta nella risposta. */
export async function POST(request: Request) {
    try {
        const body = (await request.json()) as CreateBody;
        const partnerId = body.partnerId?.trim();
        const label = body.label?.trim() || 'Credenziale API';
        if (!partnerId) {
            return NextResponse.json({ error: 'partnerId obbligatorio.' }, { status: 400 });
        }

        const partner = await prisma.partner.findFirst({
            where: { id: partnerId, deletedAt: null },
        });
        if (!partner) {
            return NextResponse.json({ error: 'Partner non trovato.' }, { status: 404 });
        }
        if (!partner.uniqueCode?.trim()) {
            return NextResponse.json(
                {
                    error:
                        'Il partner non ha un codice referral (uniqueCode). Impostalo in Fioristi prima di creare credenziali API.',
                },
                { status: 400 }
            );
        }

        let publicId = generatePartnerApiPublicId();
        for (let i = 0; i < 5; i++) {
            const clash = await prisma.partnerApiCredential.findUnique({ where: { publicId } });
            if (!clash) break;
            publicId = generatePartnerApiPublicId();
        }

        const secretPlain = generatePartnerApiSecretPlain();
        const secretHash = hashPartnerApiSecret(secretPlain);

        const row = await prisma.partnerApiCredential.create({
            data: {
                partnerId,
                label: label.slice(0, 120),
                publicId,
                secretHash,
                isActive: true,
            },
            include: {
                partner: { select: { id: true, shopName: true, uniqueCode: true } },
            },
        });

        return NextResponse.json({
            id: row.id,
            publicId: row.publicId,
            secret: secretPlain,
            label: row.label,
            partner: row.partner,
            message:
                'Salva subito il segreto: non sarà più mostrato. Autenticazione: header X-Florem-Api-Key + Authorization Bearer.',
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Creazione credenziale fallita.' }, { status: 500 });
    }
}
