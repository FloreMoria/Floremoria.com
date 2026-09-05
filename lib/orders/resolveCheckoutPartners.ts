/**
 * Risolve associazioni ordine checkout B2C: fiorista esecutore, agenzia, partner fee.
 */
import prisma from '@/lib/prisma';
import type { Partner } from '@prisma/client';
import {
    findFloristByCemeteryCoverage,
    resolveFloristPartnerIdForAgency,
    type ResolvedAgency,
} from '@/lib/orders/resolveAgencyFlorist';

export type CheckoutPartnerAssociations = {
    partnerId: string | null;
    agencyId: string | null;
    referralPartnerId: string | null;
    agencyCode: string | null;
    agencyName: string | null;
    partnershipChannel: string | null;
    partnerNotifyEmail: string | null;
    referralInstructions: string | null;
};

function toResolvedAgency(partner: Partner): ResolvedAgency {
    return {
        agencyId: partner.id,
        agencyCode: partner.uniqueCode,
        agencyName: partner.shopName,
        partnershipChannel: partner.partnershipChannel,
        defaultFloristId: partner.defaultFloristId,
        agencyNotificationEmail: partner.agencyNotificationEmail,
        aggregatorNotificationEmail: partner.aggregatorNotificationEmail,
    };
}

async function findFloristByProvince(province: string): Promise<string | null> {
    const florist = await prisma.partner.findFirst({
        where: {
            deletedAt: null,
            isActive: true,
            partnerType: 'FLORIST',
            isB2B: false,
            province,
        },
        orderBy: { adminRating: 'desc' },
        select: { id: true },
    });
    return florist?.id ?? null;
}

/**
 * referralRef può essere id Partner o uniqueCode (fiorista, agenzia o aggregatore).
 * skipAutoFloristAssignment: ordini funerale (FF) — niente coverage/provincia automatica.
 */
export async function resolveCheckoutPartnerAssociations(input: {
    referralRef?: string | null;
    deliveryProvince: string;
    cemeteryCity?: string | null;
    partnerNotifyEmail?: string | null;
    skipAutoFloristAssignment?: boolean;
}): Promise<CheckoutPartnerAssociations> {
    const prov = input.deliveryProvince.trim().toUpperCase().slice(0, 2);
    const cemeteryCity = input.cemeteryCity?.trim() || '';
    const notify =
        typeof input.partnerNotifyEmail === 'string' && input.partnerNotifyEmail.trim()
            ? input.partnerNotifyEmail.trim().slice(0, 255)
            : null;
    const skipFlorist = input.skipAutoFloristAssignment === true;

    let referralPartner: Partner | null = null;
    const ref = input.referralRef?.trim();
    if (ref) {
        referralPartner = await prisma.partner.findFirst({
            where: {
                isActive: true,
                deletedAt: null,
                OR: [{ id: ref }, { uniqueCode: ref }],
            },
        });
    }

    let partnerId: string | null = null;
    let agencyId: string | null = null;
    let referralPartnerId: string | null = null;
    let agencyCode: string | null = null;
    let agencyName: string | null = null;
    let partnershipChannel: string | null = null;
    let partnerNotifyEmail = notify;
    let referralInstructions: string | null = null;

    if (referralPartner) {
        partnershipChannel = referralPartner.partnershipChannel;
        referralInstructions = `Referral: ${referralPartner.shopName} (codice: ${ref})`;

        if (!partnerNotifyEmail) {
            partnerNotifyEmail =
                referralPartner.aggregatorNotificationEmail?.trim() ||
                referralPartner.agencyNotificationEmail?.trim() ||
                referralPartner.email?.trim() ||
                null;
        }

        if (referralPartner.partnerType === 'FLORIST') {
            // Referral esplicito a fiorista: consentito anche su FF.
            partnerId = referralPartner.id;
        } else if (referralPartner.partnerType === 'FUNERAL_AGENCY') {
            agencyId = referralPartner.id;
            referralPartnerId = referralPartner.id;
            agencyCode = referralPartner.uniqueCode;
            agencyName = referralPartner.shopName;
            if (!skipFlorist) {
                partnerId = await resolveFloristPartnerIdForAgency({
                    agency: toResolvedAgency(referralPartner),
                    cemeteryCity,
                });
            }
        } else if (referralPartner.partnerType === 'AGGREGATOR') {
            referralPartnerId = referralPartner.id;
            if (!skipFlorist) {
                partnerId =
                    (await findFloristByCemeteryCoverage(cemeteryCity)) ||
                    (prov ? await findFloristByProvince(prov) : null);
            }
        }
    }

    if (!partnerId && !skipFlorist) {
        partnerId =
            (cemeteryCity ? await findFloristByCemeteryCoverage(cemeteryCity) : null) ||
            (prov ? await findFloristByProvince(prov) : null);
    }

    return {
        partnerId,
        agencyId,
        referralPartnerId,
        agencyCode,
        agencyName,
        partnershipChannel,
        partnerNotifyEmail,
        referralInstructions,
    };
}
