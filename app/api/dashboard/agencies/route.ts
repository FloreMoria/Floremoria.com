import { NextResponse } from 'next/server';
import { PartnerType } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { generatePartnerCode } from '@/lib/codeGenerator';
import { isPartnerType } from '@/lib/orders/resolveAgencyFlorist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHANNEL_DEFAULTS = {
    AF: 'Annunci Funebri (AF)',
    DIRETTA: 'Diretta (FloreMoria)',
} as const;

function normalizeEmail(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim().toLowerCase();
    if (!t) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null;
    return t.slice(0, 255);
}

function jsonError(error: string, status: number) {
    return NextResponse.json({ ok: false, error }, { status });
}

export async function GET() {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        const [agencies, florists] = await Promise.all([
            prisma.partner.findMany({
                where: { deletedAt: null, partnerType: PartnerType.FUNERAL_AGENCY },
                orderBy: { shopName: 'asc' },
                include: {
                    defaultFlorist: {
                        select: { id: true, shopName: true, province: true, coverageArea: true },
                    },
                    _count: { select: { agencyOrders: true } },
                },
            }),
            prisma.partner.findMany({
                where: { deletedAt: null, isActive: true, partnerType: PartnerType.FLORIST },
                orderBy: { shopName: 'asc' },
                select: {
                    id: true,
                    shopName: true,
                    ownerName: true,
                    province: true,
                    coverageArea: true,
                    isActive: true,
                },
            }),
        ]);

        return NextResponse.json({ ok: true, agencies, florists });
    } catch (error) {
        console.error('[dashboard/agencies GET]', error);
        return jsonError('Errore nel caricamento agenzie.', 500);
    }
}

export async function POST(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        const body = (await request.json()) as Record<string, unknown>;
        const shopName = typeof body.shopName === 'string' ? body.shopName.trim() : '';
        const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : shopName;
        if (!shopName) return jsonError('Nome agenzia obbligatorio.', 400);

        const province =
            typeof body.province === 'string' ? body.province.trim().toUpperCase().slice(0, 2) : null;
        const coverageArea =
            typeof body.coverageArea === 'string' ? body.coverageArea.trim().slice(0, 255) : null;
        const address = typeof body.address === 'string' ? body.address.trim() : null;
        const partnershipChannel =
            typeof body.partnershipChannel === 'string' && body.partnershipChannel.trim()
                ? body.partnershipChannel.trim().slice(0, 120)
                : CHANNEL_DEFAULTS.DIRETTA;
        const agencyNotificationEmail = normalizeEmail(body.agencyNotificationEmail);
        const aggregatorNotificationEmail =
            normalizeEmail(body.aggregatorNotificationEmail) || 'assistenza@floremoria.com';
        const email = normalizeEmail(body.email) || agencyNotificationEmail;
        const defaultFloristId =
            typeof body.defaultFloristId === 'string' && body.defaultFloristId.trim()
                ? body.defaultFloristId.trim()
                : null;

        if (defaultFloristId) {
            const florist = await prisma.partner.findFirst({
                where: {
                    id: defaultFloristId,
                    deletedAt: null,
                    partnerType: PartnerType.FLORIST,
                },
                select: { id: true },
            });
            if (!florist) return jsonError('Fiorista di riferimento non valido.', 400);
        }

        let uniqueCode =
            typeof body.uniqueCode === 'string' && body.uniqueCode.trim()
                ? body.uniqueCode.trim().slice(0, 64)
                : '';
        if (!uniqueCode) {
            uniqueCode = await generatePartnerCode(province || 'XX');
        }

        const partnerType: PartnerType = isPartnerType(body.partnerType)
            ? body.partnerType
            : PartnerType.FUNERAL_AGENCY;

        const agency = await prisma.partner.create({
            data: {
                shopName,
                ownerName: ownerName || shopName,
                province,
                coverageArea,
                address,
                email,
                uniqueCode,
                isActive: body.isActive === false ? false : true,
                isB2B: true,
                partnerType,
                partnershipChannel,
                defaultFloristId,
                agencyNotificationEmail,
                aggregatorNotificationEmail,
            },
            include: {
                defaultFlorist: {
                    select: { id: true, shopName: true, province: true, coverageArea: true },
                },
                _count: { select: { agencyOrders: true } },
            },
        });

        return NextResponse.json({ ok: true, agency }, { status: 201 });
    } catch (error) {
        console.error('[dashboard/agencies POST]', error);
        return jsonError('Errore nella creazione agenzia.', 500);
    }
}

export async function PATCH(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        const body = (await request.json()) as Record<string, unknown>;
        const id = typeof body.id === 'string' ? body.id.trim() : '';
        if (!id) return jsonError('id obbligatorio.', 400);

        const existing = await prisma.partner.findFirst({
            where: { id, deletedAt: null, partnerType: PartnerType.FUNERAL_AGENCY },
            select: { id: true },
        });
        if (!existing) return jsonError('Agenzia non trovata.', 404);

        const data: Record<string, unknown> = {};

        if (typeof body.shopName === 'string' && body.shopName.trim()) {
            data.shopName = body.shopName.trim();
        }
        if (typeof body.ownerName === 'string') {
            data.ownerName = body.ownerName.trim() || undefined;
        }
        if (typeof body.province === 'string') {
            data.province = body.province.trim().toUpperCase().slice(0, 2) || null;
        }
        if (typeof body.coverageArea === 'string') {
            data.coverageArea = body.coverageArea.trim() || null;
        }
        if (typeof body.address === 'string') {
            data.address = body.address.trim() || null;
        }
        if (typeof body.partnershipChannel === 'string') {
            data.partnershipChannel = body.partnershipChannel.trim().slice(0, 120) || null;
        }
        if ('agencyNotificationEmail' in body) {
            data.agencyNotificationEmail = normalizeEmail(body.agencyNotificationEmail);
        }
        if ('aggregatorNotificationEmail' in body) {
            data.aggregatorNotificationEmail =
                normalizeEmail(body.aggregatorNotificationEmail) || 'assistenza@floremoria.com';
        }
        if ('email' in body) {
            data.email = normalizeEmail(body.email);
        }
        if ('isActive' in body) {
            data.isActive = body.isActive !== false;
        }
        if ('uniqueCode' in body && typeof body.uniqueCode === 'string') {
            data.uniqueCode = body.uniqueCode.trim().slice(0, 64) || null;
        }
        if ('defaultFloristId' in body) {
            const floristId =
                typeof body.defaultFloristId === 'string' && body.defaultFloristId.trim()
                    ? body.defaultFloristId.trim()
                    : null;
            if (floristId) {
                const florist = await prisma.partner.findFirst({
                    where: {
                        id: floristId,
                        deletedAt: null,
                        partnerType: PartnerType.FLORIST,
                    },
                    select: { id: true },
                });
                if (!florist) return jsonError('Fiorista di riferimento non valido.', 400);
            }
            data.defaultFloristId = floristId;
        }

        const agency = await prisma.partner.update({
            where: { id },
            data,
            include: {
                defaultFlorist: {
                    select: { id: true, shopName: true, province: true, coverageArea: true },
                },
                _count: { select: { agencyOrders: true } },
            },
        });

        return NextResponse.json({ ok: true, agency });
    } catch (error) {
        console.error('[dashboard/agencies PATCH]', error);
        return jsonError("Errore nell'aggiornamento agenzia.", 500);
    }
}
