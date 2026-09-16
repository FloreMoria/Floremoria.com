import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
    generatePartnerApiPublicId,
    generatePartnerApiSecretPlain,
    hashPartnerApiSecret,
} from '@/lib/partnerApiSecret';
import { verifyPartnerStripeConnect } from '@/lib/partners/stripeConnectGate';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH: revoke | regenerate.
 * regenerate invalida immediatamente la precedente e restituisce il nuovo segreto one-shot.
 */
export async function PATCH(request: Request, context: Ctx) {
    try {
        const { id } = await context.params;
        if (!id) {
            return NextResponse.json({ error: 'Id mancante.' }, { status: 400 });
        }
        const body = await request.json().catch(() => ({}));
        const action = body.action as string | undefined;

        const row = await prisma.partnerApiCredential.findUnique({
            where: { id },
            include: { partner: true },
        });
        if (!row) {
            return NextResponse.json({ error: 'Credenziale non trovata.' }, { status: 404 });
        }

        if (action === 'revoke') {
            const updated = await prisma.partnerApiCredential.update({
                where: { id },
                data: { isActive: false, revokedAt: new Date() },
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
        }

        if (action === 'regenerate') {
            const environment = row.environment;
            if (environment === 'LIVE') {
                const partner = row.partner;
                const gateTarget =
                    partner.partnerType === 'FUNERAL_AGENCY' && partner.masterPartnerId
                        ? partner.masterPartnerId
                        : partner.id;
                if (partner.partnerType === 'AGGREGATOR' || partner.masterPartnerId) {
                    const connect = await verifyPartnerStripeConnect(gateTarget);
                    if (!connect.ok && partner.partnerType === 'AGGREGATOR') {
                        return NextResponse.json(
                            {
                                error: `Rigenerazione live bloccata: Connect non verificato. ${connect.detail}`,
                                code: 'STRIPE_CONNECT_NOT_READY',
                            },
                            { status: 409 }
                        );
                    }
                }
            }

            const now = new Date();
            await prisma.partnerApiCredential.update({
                where: { id },
                data: { isActive: false, revokedAt: now, regeneratedAt: now },
            });

            let publicId = generatePartnerApiPublicId(environment, row.partner.uniqueCode || undefined);
            for (let i = 0; i < 5; i++) {
                const clash = await prisma.partnerApiCredential.findUnique({ where: { publicId } });
                if (!clash) break;
                publicId = generatePartnerApiPublicId(environment, row.partner.uniqueCode || undefined);
            }
            const secretPlain = generatePartnerApiSecretPlain(environment);
            const secretHash = hashPartnerApiSecret(secretPlain);

            const created = await prisma.partnerApiCredential.create({
                data: {
                    partnerId: row.partnerId,
                    label: `${row.label} (rigenerata)`,
                    publicId,
                    secretHash,
                    environment,
                    isActive: true,
                },
                include: {
                    partner: { select: { id: true, shopName: true, uniqueCode: true } },
                },
            });

            return NextResponse.json({
                id: created.id,
                publicId: created.publicId,
                secret: secretPlain,
                environment: created.environment,
                revokedPreviousId: row.id,
                partner: created.partner,
                message:
                    'Credenziale precedente invalidata. Copia subito il nuovo segreto: non sarà più visibile.',
            });
        }

        return NextResponse.json(
            { error: 'Azione non supportata (usa action: "revoke" | "regenerate").' },
            { status: 400 }
        );
    } catch (e) {
        console.error('[partner-api-credentials] patch failed', e instanceof Error ? e.message : e);
        return NextResponse.json({ error: 'Operazione credenziale fallita.' }, { status: 500 });
    }
}
