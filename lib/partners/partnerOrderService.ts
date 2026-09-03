/**
 * Ingestion ordini B2B via API REST — associazioni partner/agenzia, fee 10%, cache dashboard.
 */
import type { Partner, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import type { ResolvedAgency } from '@/lib/orders/resolveAgencyFlorist';
import { calculatePartnerCommissionCents } from '@/lib/pricing/calculatePartnerCommission';

export type PartnerAuthSnapshot = Pick<
    Partner,
    'id' | 'shopName' | 'partnerType' | 'partnershipChannel' | 'uniqueCode'
>;

export type B2bOrderAssociationInput = {
    authPartner: PartnerAuthSnapshot;
    resolvedAgency: ResolvedAgency | null;
    totalPriceCents: number;
    partnershipChannelOverride?: string | null;
    agencyNameOverride?: string | null;
};

export type B2bOrderAssociationResult = {
    partnerId: string | null;
    agencyId: string | null;
    agencyCode: string | null;
    agencyName: string | null;
    referralPartnerId: string | null;
    partnershipChannel: string | null;
    partnerCommissionCents: number | null;
    partnerCommissionSettlementStatus: 'PENDING';
};

/**
 * Risolve fiorista esecutore, agenzia, partner fee e canale commerciale per ordini API REST.
 */
export function resolveB2bOrderAssociations(input: B2bOrderAssociationInput): B2bOrderAssociationResult {
    const { authPartner, resolvedAgency, totalPriceCents } = input;

    let agencyId = resolvedAgency?.agencyId ?? null;
    let agencyCode = resolvedAgency?.agencyCode ?? null;
    let agencyName = input.agencyNameOverride?.trim() || resolvedAgency?.agencyName || null;

    // Agenzia funebre autenticata direttamente senza agencyId nel payload.
    if (!agencyId && authPartner.partnerType === 'FUNERAL_AGENCY') {
        agencyId = authPartner.id;
        agencyCode = agencyCode ?? authPartner.uniqueCode;
        agencyName = agencyName ?? authPartner.shopName;
    }

    let referralPartnerId: string | null = null;
    if (authPartner.partnerType === 'AGGREGATOR') {
        referralPartnerId = authPartner.id;
    } else if (authPartner.partnerType === 'FUNERAL_AGENCY') {
        referralPartnerId = agencyId ?? authPartner.id;
    } else if (resolvedAgency) {
        referralPartnerId = authPartner.id;
    }

    const partnershipChannel =
        input.partnershipChannelOverride?.trim() ||
        resolvedAgency?.partnershipChannel?.trim() ||
        authPartner.partnershipChannel?.trim() ||
        defaultPartnershipChannel(authPartner);

    const partnerCommissionCents = referralPartnerId
        ? calculatePartnerCommissionCents(totalPriceCents)
        : null;

    return {
        partnerId: null,
        agencyId,
        agencyCode,
        agencyName,
        referralPartnerId,
        partnershipChannel,
        partnerCommissionCents,
        partnerCommissionSettlementStatus: 'PENDING',
    };
}

function defaultPartnershipChannel(partner: PartnerAuthSnapshot): string {
    if (partner.partnerType === 'FUNERAL_AGENCY') {
        return 'AGENCY_DIRECT';
    }
    if (partner.partnerType === 'AGGREGATOR') {
        if (/annunci\s*funebr/i.test(partner.shopName) || partner.uniqueCode?.toUpperCase().startsWith('AF')) {
            return 'ANNUNCI_FUNEBRI';
        }
        return 'B2B_PARTNER';
    }
    return 'B2B_PARTNER';
}

export type PartnerOrderIngestionLogContext = {
    source: 'api_v1_partner_order_create' | 'api_external_handoff';
    orderId: string;
    orderNumber: string | null;
    authPartner: PartnerAuthSnapshot;
    association: B2bOrderAssociationResult;
    floristPartnerId: string | null;
    totalPriceCents: number;
};

/** Log strutturato per diagnostica ordini B2B (tag partner mittente). */
export function logPartnerOrderIngestion(ctx: PartnerOrderIngestionLogContext): void {
    console.info('[partner-order-ingestion]', {
        tag: `partner:${ctx.authPartner.id}`,
        partnerType: ctx.authPartner.partnerType,
        shopName: ctx.authPartner.shopName,
        uniqueCode: ctx.authPartner.uniqueCode,
        source: ctx.source,
        orderId: ctx.orderId,
        orderNumber: ctx.orderNumber,
        totalPriceCents: ctx.totalPriceCents,
        floristPartnerId: ctx.floristPartnerId,
        agencyId: ctx.association.agencyId,
        referralPartnerId: ctx.association.referralPartnerId,
        partnershipChannel: ctx.association.partnershipChannel,
        partnerCommissionCents: ctx.association.partnerCommissionCents,
        settlementStatus: ctx.association.partnerCommissionSettlementStatus,
    });
}

/** Invalida cache Next.js delle pagine dashboard che mostrano metriche partner/agenzia. */
export function revalidatePartnerOrderDashboardCaches(input: {
    referralPartnerId?: string | null;
    agencyId?: string | null;
    floristPartnerId?: string | null;
}): void {
    try {
        revalidatePath('/dashboard/partner');
        revalidatePath('/dashboard/agenzie');
        revalidatePath('/dashboard/orders');
        revalidatePath('/dashboard/finance');
        revalidatePath('/api/dashboard/metrics');
        revalidatePath('/api/dashboard/finance');

        if (input.referralPartnerId) {
            revalidatePath(`/dashboard/partners/${input.referralPartnerId}`);
        }
        if (input.agencyId) {
            revalidatePath(`/dashboard/agenzie/${input.agencyId}`);
        }
        if (input.floristPartnerId) {
            revalidatePath(`/dashboard/fioristi/${input.floristPartnerId}`);
        }
    } catch {
        // Safe fallback in test or execution environments where static store is absent
    }
}

export function buildB2bOrderCreateData(
    association: B2bOrderAssociationResult,
    floristPartnerId: string | null
): Pick<
    Prisma.OrderUncheckedCreateInput,
    | 'partnerId'
    | 'agencyId'
    | 'agencyCode'
    | 'agencyName'
    | 'referralPartnerId'
    | 'partnershipChannel'
    | 'partnerCommissionCents'
    | 'partnerCommissionSettlementStatus'
> {
    return {
        partnerId: floristPartnerId,
        agencyId: association.agencyId,
        agencyCode: association.agencyCode,
        agencyName: association.agencyName,
        referralPartnerId: association.referralPartnerId,
        partnershipChannel: association.partnershipChannel,
        partnerCommissionCents: association.partnerCommissionCents,
        partnerCommissionSettlementStatus: association.partnerCommissionCents
            ? association.partnerCommissionSettlementStatus
            : undefined,
    };
}
