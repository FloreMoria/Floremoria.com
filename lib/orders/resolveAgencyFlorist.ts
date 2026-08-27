/**
 * Risolve agenzia funebre + fiorista predefinito (o fallback copertura geografica).
 * Perché: gli ordini B2B AF/Diretta devono arrivare al fiorista giusto senza intervento manuale.
 */

import prisma from '@/lib/prisma';
import type { Partner, PartnerType } from '@prisma/client';

export type ResolvedAgency = {
    agencyId: string;
    agencyCode: string | null;
    agencyName: string;
    partnershipChannel: string | null;
    defaultFloristId: string | null;
    agencyNotificationEmail: string | null;
    aggregatorNotificationEmail: string | null;
};

function normalizeCity(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

const AGENCY_SELECT = {
    id: true,
    shopName: true,
    uniqueCode: true,
    partnershipChannel: true,
    defaultFloristId: true,
    agencyNotificationEmail: true,
    aggregatorNotificationEmail: true,
    partnerType: true,
    isActive: true,
    deletedAt: true,
} as const;

function toResolved(agency: {
    id: string;
    shopName: string;
    uniqueCode: string | null;
    partnershipChannel: string | null;
    defaultFloristId: string | null;
    agencyNotificationEmail: string | null;
    aggregatorNotificationEmail: string | null;
}): ResolvedAgency {
    return {
        agencyId: agency.id,
        agencyCode: agency.uniqueCode,
        agencyName: agency.shopName,
        partnershipChannel: agency.partnershipChannel,
        defaultFloristId: agency.defaultFloristId,
        agencyNotificationEmail: agency.agencyNotificationEmail,
        aggregatorNotificationEmail: agency.aggregatorNotificationEmail,
    };
}

/**
 * Cerca agenzia per id Partner o uniqueCode / agencyCode esterno.
 */
export async function findFuneralAgency(params: {
    agencyId?: string | null;
    agencyCode?: string | null;
}): Promise<ResolvedAgency | null> {
    const id = params.agencyId?.trim() || '';
    const code = params.agencyCode?.trim() || '';

    if (id) {
        const byId = await prisma.partner.findFirst({
            where: {
                id,
                deletedAt: null,
                isActive: true,
                partnerType: 'FUNERAL_AGENCY',
            },
            select: AGENCY_SELECT,
        });
        if (byId) return toResolved(byId);
    }

    if (code) {
        const byCode = await prisma.partner.findFirst({
            where: {
                deletedAt: null,
                isActive: true,
                partnerType: 'FUNERAL_AGENCY',
                OR: [{ uniqueCode: code }, { uniqueCode: { equals: code, mode: 'insensitive' } }],
            },
            select: AGENCY_SELECT,
        });
        if (byCode) return toResolved(byCode);
    }

    return null;
}

/**
 * Fallback geografico: fiorista (non B2B) con coverageArea sul comune del cimitero.
 */
export async function findFloristByCemeteryCoverage(cemeteryCity: string): Promise<string | null> {
    const cityNorm = normalizeCity(cemeteryCity);
    if (!cityNorm) return null;

    const coveragePartners = await prisma.partner.findMany({
        where: {
            deletedAt: null,
            isActive: true,
            partnerType: 'FLORIST',
            isB2B: false,
        },
        select: { id: true, coverageArea: true },
        take: 500,
    });

    const hit = coveragePartners.find((p) => {
        const cov = normalizeCity(p.coverageArea || '');
        if (!cov) return false;
        return cityNorm.includes(cov) || cov.includes(cityNorm.split(' ')[0] || '');
    });

    return hit?.id ?? null;
}

/**
 * partnerId fiorista: default dell'agenzia → copertura geografica → null.
 */
export async function resolveFloristPartnerIdForAgency(params: {
    agency: ResolvedAgency | null;
    cemeteryCity: string;
}): Promise<string | null> {
    if (params.agency?.defaultFloristId) {
        const florist = await prisma.partner.findFirst({
            where: {
                id: params.agency.defaultFloristId,
                deletedAt: null,
                isActive: true,
                partnerType: 'FLORIST',
            },
            select: { id: true },
        });
        if (florist) return florist.id;
    }

    return findFloristByCemeteryCoverage(params.cemeteryCity);
}

export type PartnerAgencyFields = Pick<
    Partner,
    | 'partnershipChannel'
    | 'agencyNotificationEmail'
    | 'aggregatorNotificationEmail'
    | 'defaultFloristId'
    | 'partnerType'
>;

export function isPartnerType(v: unknown): v is PartnerType {
    return v === 'FLORIST' || v === 'FUNERAL_AGENCY' || v === 'AGGREGATOR';
}
