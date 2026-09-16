import prisma from '@/lib/prisma';
import { PartnerType } from '@prisma/client';
import B2BHubClient, { type HubPartner } from './B2BHubClient';
import { runDashboardQuery } from '@/lib/dashboardSafeQuery';
import DashboardDbAlert from '@/components/dashboard/DashboardDbAlert';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Partner B2B',
};

function currentYearMonth(d = new Date()): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function B2BPartnersPage() {
    const ym = currentYearMonth();

    const partnersResult = await runDashboardQuery('partner/b2b-hub', [], () =>
        prisma.partner.findMany({
            where: { deletedAt: null },
            orderBy: { shopName: 'asc' },
            include: {
                masterPartner: { select: { id: true, shopName: true } },
                apiCredentials: {
                    orderBy: { createdAt: 'desc' },
                },
                feeMonthCloses: {
                    where: { yearMonth: ym },
                    take: 1,
                },
                agencyOrders: {
                    where: { deletedAt: null, isTest: false, status: { not: 'CANCELLED' } },
                    select: { totalPriceCents: true, createdAt: true },
                    orderBy: { createdAt: 'desc' },
                },
            },
        })
    );

    const partners = partnersResult.data;

    const toHub = (p: (typeof partners)[number]): HubPartner => ({
        id: p.id,
        shopName: p.shopName,
        ownerName: p.ownerName,
        uniqueCode: p.uniqueCode,
        partnerType: p.partnerType,
        isActive: p.isActive,
        masterPartnerId: p.masterPartnerId,
        masterPartnerName: p.masterPartner?.shopName ?? null,
        commissionPercentInclusive:
            p.commissionPercentInclusive != null ? Number(p.commissionPercentInclusive) : null,
        stripeConnectAccountId: p.stripeConnectAccountId,
        stripeConnectChargesEnabled: p.stripeConnectChargesEnabled,
        stripeConnectPayoutsEnabled: p.stripeConnectPayoutsEnabled,
        stripeConnectVerifiedAt: p.stripeConnectVerifiedAt?.toISOString() ?? null,
        agencyOrderCount: p.agencyOrders.length,
        agencyOrderValueCents: p.agencyOrders.reduce((s, o) => s + o.totalPriceCents, 0),
        lastAgencyOrderAt: p.agencyOrders[0]?.createdAt?.toISOString() ?? null,
        feeMonth: p.feeMonthCloses[0]
            ? {
                  yearMonth: p.feeMonthCloses[0].yearMonth,
                  maturedCents: p.feeMonthCloses[0].maturedCents,
                  status: p.feeMonthCloses[0].status,
                  invoiceCents: p.feeMonthCloses[0].invoiceCents,
                  connectCents: p.feeMonthCloses[0].connectCents,
              }
            : null,
        credentials: p.apiCredentials.map((c) => ({
            id: c.id,
            label: c.label,
            publicId: c.publicId,
            environment: c.environment,
            isActive: c.isActive,
            createdAt: c.createdAt.toISOString(),
            revokedAt: c.revokedAt?.toISOString() ?? null,
            regeneratedAt: c.regeneratedAt?.toISOString() ?? null,
            lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
            partnerId: c.partnerId,
        })),
    });

    const masters = partners.filter((p) => p.partnerType === PartnerType.AGGREGATOR).map(toHub);
    const agencies = partners.filter((p) => p.partnerType === PartnerType.FUNERAL_AGENCY).map(toHub);
    const florists = partners
        .filter((p) => p.partnerType === PartnerType.FLORIST && !p.isB2B)
        .map(toHub);

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in">
            <DashboardDbAlert
                page="Partner B2B"
                errors={[!partnersResult.ok ? partnersResult.error : null].filter(Boolean) as string[]}
            />
            <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">
                    Florem B2B Hub (Gestione Partner)
                </h1>
                <p className="text-gray-500 font-medium">
                    Tre categorie distinte: Master (aggregatore), Agenzia, Fiorista. Credenziali API
                    indipendenti da Stripe Connect; segreti one-shot in Hub, mai in chiaro a database.
                </p>
            </div>

            <B2BHubClient masters={masters} agencies={agencies} florists={florists} />
        </div>
    );
}
