import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
    generatePartnerApiPublicId,
    generatePartnerApiSecretPlain,
    hashPartnerApiSecret,
    inferEnvironmentFromPublicId,
} from '@/lib/partnerApiSecret';
import type { PartnerApiCredentialEnvironment } from '@prisma/client';

export async function GET() {
    try {
        const rows = await prisma.partnerApiCredential.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                partner: {
                    select: {
                        id: true,
                        shopName: true,
                        uniqueCode: true,
                        partnerType: true,
                        masterPartnerId: true,
                    },
                },
            },
        });
        return NextResponse.json(
            rows.map((r) => ({
                id: r.id,
                label: r.label,
                publicId: r.publicId,
                environment: r.environment,
                isActive: r.isActive,
                createdAt: r.createdAt.toISOString(),
                revokedAt: r.revokedAt?.toISOString() ?? null,
                regeneratedAt: r.regeneratedAt?.toISOString() ?? null,
                lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
                partner: r.partner,
            }))
        );
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Lettura credenziali fallita.' }, { status: 500 });
    }
}

type CreateBody = {
    partnerId?: string;
    label?: string;
    environment?: 'TEST' | 'LIVE';
};

/**
 * Crea credenziale; il **segreto** è restituito una sola volta nella risposta (Hub one-shot).
 * Mai loggato. Chiavi API indipendenti da Stripe Connect (il denaro è un altro flusso).
 */
export async function POST(request: Request) {
    try {
        const body = (await request.json()) as CreateBody;
        const partnerId = body.partnerId?.trim();
        const label = body.label?.trim() || 'Credenziale API';
        const environment: PartnerApiCredentialEnvironment =
            body.environment === 'LIVE' ? 'LIVE' : 'TEST';
        if (!partnerId) {
            return NextResponse.json({ error: 'partnerId obbligatorio.' }, { status: 400 });
        }

        const partner = await prisma.partner.findFirst({
            where: { id: partnerId, deletedAt: null },
        });
        if (!partner) {
            return NextResponse.json({ error: 'Partner non trovato.' }, { status: 404 });
        }
        if (partner.partnerType === 'FLORIST') {
            return NextResponse.json(
                { error: 'I fioristi non hanno credenziali API di acquisizione ordini.' },
                { status: 400 }
            );
        }
        if (!partner.uniqueCode?.trim()) {
            return NextResponse.json(
                { error: 'Il partner non ha uniqueCode. Impostalo prima di creare credenziali.' },
                { status: 400 }
            );
        }

        let publicId = generatePartnerApiPublicId(environment, partner.uniqueCode);
        for (let i = 0; i < 5; i++) {
            const clash = await prisma.partnerApiCredential.findUnique({ where: { publicId } });
            if (!clash) break;
            publicId = generatePartnerApiPublicId(environment, partner.uniqueCode);
        }

        const secretPlain = generatePartnerApiSecretPlain(environment);
        const secretHash = hashPartnerApiSecret(secretPlain);

        const row = await prisma.partnerApiCredential.create({
            data: {
                partnerId,
                label: label.slice(0, 120),
                publicId,
                secretHash,
                environment,
                isActive: true,
            },
            include: {
                partner: { select: { id: true, shopName: true, uniqueCode: true, partnerType: true } },
            },
        });

        // Non loggare secretPlain.
        return NextResponse.json({
            id: row.id,
            publicId: row.publicId,
            secret: secretPlain,
            environment: row.environment,
            label: row.label,
            partner: row.partner,
            message:
                'Copia subito il segreto: non sarà più mostrato. Autenticazione: X-Partner-Key + Bearer.',
        });
    } catch (e) {
        console.error('[partner-api-credentials] create failed', e instanceof Error ? e.message : e);
        return NextResponse.json({ error: 'Creazione credenziale fallita.' }, { status: 500 });
    }
}

void inferEnvironmentFromPublicId;
