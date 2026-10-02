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
    masterPartnerId: string | null;
};

export function normalizeCityName(s: string): string {
    if (!s) return '';
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

/**
 * Suddivide la stringa coverageArea in singoli comuni normalizzati (es. "Como, Brunate; Cernobbio").
 */
export function parseCoverageMunicipalities(coverageArea: string | null | undefined): string[] {
    if (!coverageArea) return [];
    return coverageArea
        .split(/[,;\n\r/|]+/)
        .map((part) => normalizeCityName(part))
        .filter((part) => part.length > 0);
}

function normalizeCity(s: string): string {
    return normalizeCityName(s);
}

const AGENCY_SELECT = {
    id: true,
    shopName: true,
    uniqueCode: true,
    slug: true,
    partnershipChannel: true,
    defaultFloristId: true,
    agencyNotificationEmail: true,
    aggregatorNotificationEmail: true,
    masterPartnerId: true,
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
    masterPartnerId: string | null;
}): ResolvedAgency {
    return {
        agencyId: agency.id,
        agencyCode: agency.uniqueCode,
        agencyName: agency.shopName,
        partnershipChannel: agency.partnershipChannel,
        defaultFloristId: agency.defaultFloristId,
        agencyNotificationEmail: agency.agencyNotificationEmail,
        aggregatorNotificationEmail: agency.aggregatorNotificationEmail,
        masterPartnerId: agency.masterPartnerId,
    };
}

/**
 * Cerca agenzia per id Partner, uniqueCode / agencyCode esterno, oppure nome/slug.
 * Perché: AF spesso invia solo agencyName (es. "iof-san-marco") senza agencyId.
 */
export async function findFuneralAgency(params: {
    agencyId?: string | null;
    agencyCode?: string | null;
    agencyName?: string | null;
}): Promise<ResolvedAgency | null> {
    const id = params.agencyId?.trim() || '';
    const code = params.agencyCode?.trim() || '';
    const name = params.agencyName?.trim() || '';

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

    if (name) {
        const slugish = name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const candidates = await prisma.partner.findMany({
            where: {
                deletedAt: null,
                isActive: true,
                partnerType: 'FUNERAL_AGENCY',
                OR: [
                    { uniqueCode: { equals: name, mode: 'insensitive' } },
                    { shopName: { equals: name, mode: 'insensitive' } },
                    ...(slugish
                        ? [
                              { uniqueCode: { equals: slugish, mode: 'insensitive' as const } },
                              { slug: { equals: slugish, mode: 'insensitive' as const } },
                          ]
                        : []),
                ],
            },
            select: AGENCY_SELECT,
            take: 20,
        });

        if (candidates.length === 1) return toResolved(candidates[0]);

        // Match slugificato su shopName (es. "IOF San Marco" ↔ "iof-san-marco").
        if (slugish && candidates.length === 0) {
            const agencies = await prisma.partner.findMany({
                where: {
                    deletedAt: null,
                    isActive: true,
                    partnerType: 'FUNERAL_AGENCY',
                },
                select: AGENCY_SELECT,
                take: 500,
            });
            const matched = agencies.filter((a) => {
                const shopSlug = a.shopName
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
                return shopSlug === slugish || (a.uniqueCode || '').toLowerCase() === slugish;
            });
            if (matched.length === 1) return toResolved(matched[0]);
        } else if (candidates.length > 1 && slugish) {
            const exact = candidates.find((a) => {
                const shopSlug = a.shopName
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
                return (
                    shopSlug === slugish ||
                    (a.uniqueCode || '').toLowerCase() === slugish ||
                    (a.uniqueCode || '').toLowerCase() === name.toLowerCase()
                );
            });
            if (exact) return toResolved(exact);
        }
    }

    return null;
}

/**
 * Ricerca fiorista partner (non B2B) per copertura geografica esatta del comune del cimitero.
 * REGOLA TASSATIVA 1 A 1: solo corrispondenza esatta (uguale al 100% dopo normalizzazione).
 * Vietati categoricamente fallback a raggio, prefisso, inclusione parziale o primo fiorista in lista.
 */
export async function findFloristByCemeteryCoverage(cemeteryCity: string): Promise<string | null> {
    const cityNorm = normalizeCityName(cemeteryCity);
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
        const coveredCities = parseCoverageMunicipalities(p.coverageArea);
        return coveredCities.some((c) => c === cityNorm);
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
