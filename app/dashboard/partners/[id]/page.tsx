import { notFound } from 'next/navigation';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';
import { getPartnerCommissionSummary } from '@/lib/financial/partnerCommissionRegister';
import PartnerCommissionPanel from '@/components/dashboard/PartnerCommissionPanel';
import { ArrowLeft, Globe } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const partner = await prisma.partner.findFirst({
        where: { id, deletedAt: null },
        select: { shopName: true },
    });
    return {
        title: partner?.shopName ? `Scheda Partner (${partner.shopName})` : 'Scheda Partner',
    };
}

export default async function PartnerDossierPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const testModeActive = await getDashboardTestModeActive();

    const partner = await prisma.partner.findFirst({
        where: { id, deletedAt: null, isB2B: true },
    });

    if (!partner) return notFound();

    const summary = await getPartnerCommissionSummary(id, testModeActive);
    if (!summary) return notFound();

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in space-y-6">
            <Link
                href="/dashboard/partner"
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
                <ArrowLeft size={16} /> Torna ai partner B2B
            </Link>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="rounded-full bg-gray-100 p-3">
                        <Globe className="text-gray-700" size={22} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-display font-bold text-gray-900">{partner.shopName}</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {partner.partnerType} · {partner.partnershipChannel || 'Canale B2B'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
                            {partner.uniqueCode ? <span>Codice referral: {partner.uniqueCode}</span> : null}
                            {partner.aggregatorNotificationEmail ? (
                                <span>Email provider: {partner.aggregatorNotificationEmail}</span>
                            ) : null}
                        </div>
                        <div className="mt-4 flex gap-3">
                            <Link
                                href={`/dashboard/orders?partnerId=${encodeURIComponent(partner.id)}`}
                                className="text-sm font-semibold text-gray-800 hover:underline"
                            >
                                Vedi ordini collegati
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <PartnerCommissionPanel
                partnerId={partner.id}
                partnerName={partner.shopName}
                initialSummary={summary}
            />
        </div>
    );
}
