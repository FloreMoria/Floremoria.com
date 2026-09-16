/**
 * Ingestion ordini B2B via API REST — tre ruoli (master / agenzia / fiorista), fee % su master.
 * Stop scrittura su referralPartnerId (legacy sola lettura).
 */
import type { Partner, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import type { ResolvedAgency } from '@/lib/orders/resolveAgencyFlorist';
import { calculatePartnerCommissionBreakdown } from '@/lib/pricing/calculatePartnerCommission';

export type PartnerAuthSnapshot = Pick<
    Partner,
    'id' | 'shopName' | 'partnerType' | 'partnershipChannel' | 'uniqueCode' | 'masterPartnerId'
>;

export type B2bOrderAssociationInput = {
    authPartner: PartnerAuthSnapshot;
    resolvedAgency: ResolvedAgency | null;
    totalPriceCents: number;
    /** % fee IVA inclusa dal master (o agenzia diretta). */
    commissionPercentInclusive: number | null;
    partnershipChannelOverride?: string | null;
    agencyNameOverride?: string | null;
    apiCredentialId?: string | null;
};

export type B2bOrderAssociationResult = {
    /** Fiorista esecutore — valorizzato dal chiamante via buildB2bOrderCreateData. */
    partnerId: string | null;
    agencyId: string | null;
    agencyCode: string | null;
    agencyName: string | null;
    masterPartnerId: string | null;
    apiCredentialId: string | null;
    partnershipChannel: string | null;
    partnerCommissionCents: number | null;
    partnerCommissionTaxableCents: number | null;
    partnerCommissionVatCents: number | null;
    partnerCommissionSettlementStatus: 'PENDING';
};

/**
 * Risolve fiorista esecutore, agenzia, master e fee per ordini API REST.
 */
export function resolveB2bOrderAssociations(input: B2bOrderAssociationInput): B2bOrderAssociationResult {
    const { authPartner, resolvedAgency, totalPriceCents } = input;

    let agencyId = resolvedAgency?.agencyId ?? null;
    let agencyCode = resolvedAgency?.agencyCode ?? null;
    let agencyName = input.agencyNameOverride?.trim() || resolvedAgency?.agencyName || null;

    if (!agencyId && authPartner.partnerType === 'FUNERAL_AGENCY') {
        agencyId = authPartner.id;
        agencyCode = agencyCode ?? authPartner.uniqueCode;
        agencyName = agencyName ?? authPartner.shopName;
    }

    let masterPartnerId: string | null = null;
    if (authPartner.partnerType === 'AGGREGATOR') {
        masterPartnerId = authPartner.id;
    } else if (authPartner.partnerType === 'FUNERAL_AGENCY') {
        masterPartnerId = authPartner.masterPartnerId ?? null;
    } else if (resolvedAgency?.masterPartnerId) {
        masterPartnerId = resolvedAgency.masterPartnerId;
    }

    const feeCreditorId = masterPartnerId ?? (authPartner.partnerType === 'FUNERAL_AGENCY' ? agencyId : null);
    const percent = input.commissionPercentInclusive;

    let partnerCommissionCents: number | null = null;
    let partnerCommissionTaxableCents: number | null = null;
    let partnerCommissionVatCents: number | null = null;
    if (feeCreditorId && percent != null && percent > 0) {
        const b = calculatePartnerCommissionBreakdown(totalPriceCents, percent);
        partnerCommissionCents = b.grossCents;
        partnerCommissionTaxableCents = b.taxableCents;
        partnerCommissionVatCents = b.vatCents;
    }

    const partnershipChannel =
        input.partnershipChannelOverride?.trim() ||
        resolvedAgency?.partnershipChannel?.trim() ||
        authPartner.partnershipChannel?.trim() ||
        defaultPartnershipChannel(authPartner);

    return {
        partnerId: null,
        agencyId,
        agencyCode,
        agencyName,
        masterPartnerId,
        apiCredentialId: input.apiCredentialId ?? null,
        partnershipChannel,
        partnerCommissionCents,
        partnerCommissionTaxableCents,
        partnerCommissionVatCents,
        partnerCommissionSettlementStatus: 'PENDING',
    };
}

function defaultPartnershipChannel(partner: PartnerAuthSnapshot): string {
    if (partner.partnerType === 'FUNERAL_AGENCY') {
        return partner.masterPartnerId ? 'ANNUNCI_FUNEBRI' : 'AGENCY_DIRECT';
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
        masterPartnerId: ctx.association.masterPartnerId,
        apiCredentialId: ctx.association.apiCredentialId,
        partnershipChannel: ctx.association.partnershipChannel,
        partnerCommissionCents: ctx.association.partnerCommissionCents,
        partnerCommissionTaxableCents: ctx.association.partnerCommissionTaxableCents,
        partnerCommissionVatCents: ctx.association.partnerCommissionVatCents,
        settlementStatus: ctx.association.partnerCommissionSettlementStatus,
    });
}

export function revalidatePartnerOrderDashboardCaches(input: {
    masterPartnerId?: string | null;
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

        if (input.masterPartnerId) {
            revalidatePath(`/dashboard/partners/${input.masterPartnerId}`);
        }
        if (input.agencyId) {
            revalidatePath(`/dashboard/agenzie/${input.agencyId}`);
        }
        if (input.floristPartnerId) {
            revalidatePath(`/dashboard/fioristi/${input.floristPartnerId}`);
        }
    } catch {
        // Safe fallback when static store absent
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
    | 'masterPartnerId'
    | 'apiCredentialId'
    | 'partnershipChannel'
    | 'partnerCommissionCents'
    | 'partnerCommissionTaxableCents'
    | 'partnerCommissionVatCents'
    | 'partnerCommissionSettlementStatus'
> {
    return {
        partnerId: floristPartnerId,
        agencyId: association.agencyId,
        agencyCode: association.agencyCode,
        agencyName: association.agencyName,
        masterPartnerId: association.masterPartnerId,
        apiCredentialId: association.apiCredentialId,
        partnershipChannel: association.partnershipChannel,
        partnerCommissionCents: association.partnerCommissionCents,
        partnerCommissionTaxableCents: association.partnerCommissionTaxableCents,
        partnerCommissionVatCents: association.partnerCommissionVatCents,
        partnerCommissionSettlementStatus: association.partnerCommissionCents
            ? association.partnerCommissionSettlementStatus
            : undefined,
    };
}
