import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { normalizePartnerExternalPayload } from '@/lib/partnerExternalOrderData';
import { verifyPartnerApiSecret } from '@/lib/partnerApiSecret';

const TTL_MINUTES = 30;

function accessControlAllowOrigin(request: Request): string | null {
    if (process.env.NODE_ENV === 'development') return '*';
    const raw = process.env.PARTNER_INBOUND_CORS_ORIGIN?.trim();
    if (!raw || raw === 'none') return null;
    if (raw === '*') return '*';
    const origin = request.headers.get('origin');
    const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && allowed.includes(origin)) return origin;
    return null;
}

function corsHeaders(request: Request): HeadersInit {
    const acao = accessControlAllowOrigin(request);
    const base: Record<string, string> = {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Florem-Api-Key',
        'Access-Control-Max-Age': '86400',
    };
    if (acao) base['Access-Control-Allow-Origin'] = acao;
    return base;
}

export async function OPTIONS(request: Request): Promise<Response> {
    return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * Compatibile con il vecchio `POST api/external/order-data`.
 *
 * Autenticazione (una delle due):
 * 1) **Credenziali dashboard:** `X-Florem-Api-Key: <publicId>` + `Authorization: Bearer <secret>` (generati in Dashboard → Credenziali API partner).
 * 2) **Legacy env:** solo `Authorization: Bearer <PARTNER_INBOUND_API_SECRET>` (se variabile impostata).
 *
 * Con (1), il `codiceReferral` nel body deve coincidere con il partner collegato alla credenziale.
 */
export async function POST(request: Request): Promise<Response> {
    const headers = { ...corsHeaders(request), 'Content-Type': 'application/json' };

    const envSecret = process.env.PARTNER_INBOUND_API_SECRET?.trim();
    const publicId = request.headers.get('x-florem-api-key')?.trim() ?? '';
    const authHeader = request.headers.get('authorization')?.trim() ?? '';
    const bearer =
        authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

    let credentialPartnerId: string | null = null;
    let credentialId: string | null = null;

    if (publicId && bearer) {
        const cred = await prisma.partnerApiCredential.findFirst({
            where: { publicId, isActive: true },
        });
        if (!cred || !verifyPartnerApiSecret(bearer, cred.secretHash)) {
            return NextResponse.json({ error: 'Non autorizzato (chiave API o segreto non validi).' }, { status: 401, headers });
        }
        credentialPartnerId = cred.partnerId;
        credentialId = cred.id;
    } else if (envSecret && bearer === envSecret) {
        credentialPartnerId = null;
    } else {
        const hint =
            publicId && !bearer
                ? 'Invia anche Authorization: Bearer con il segreto mostrato una sola volta alla creazione della credenziale.'
                : 'Usa X-Florem-Api-Key + Bearer (credenziali dashboard) oppure Bearer con PARTNER_INBOUND_API_SECRET (legacy).';
        return NextResponse.json({ error: `Non autorizzato. ${hint}` }, { status: 401, headers });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'JSON non valido.' }, { status: 400, headers });
    }

    const payload = normalizePartnerExternalPayload(body);
    if (!payload) {
        return NextResponse.json(
            {
                error:
                    'Payload incompleto. Obbligatori: nomeDefunto, cognomeDefunto, codiceReferral, redirectUrl, emailAziendaPartner (camelCase o PascalCase).',
            },
            { status: 400, headers }
        );
    }

    const partner = await prisma.partner.findFirst({
        where: { uniqueCode: payload.codiceReferral, isActive: true, deletedAt: null },
    });
    if (!partner) {
        return NextResponse.json(
            {
                error: `Nessun partner attivo con uniqueCode="${payload.codiceReferral}". Crea il partner in dashboard e assegna il codice referral.`,
            },
            { status: 422, headers }
        );
    }

    if (credentialPartnerId && partner.id !== credentialPartnerId) {
        return NextResponse.json(
            {
                error:
                    'Il codiceReferral non appartiene al partner associato a questa credenziale API. Usa il referral del partner corretto o crea un’altra credenziale.',
            },
            { status: 403, headers }
        );
    }

    if (credentialId) {
        await prisma.partnerApiCredential.update({
            where: { id: credentialId },
            data: { lastUsedAt: new Date() },
        });
    }

    const externalKey = randomUUID();
    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

    await prisma.partnerHandoffSession.create({
        data: {
            externalKey,
            payload: payload as object,
            expiresAt,
            partnerId: partner.id,
        },
    });

    return NextResponse.json(
        { message: 'Dati ricevuti correttamente!', externalKey },
        { status: 200, headers }
    );
}
