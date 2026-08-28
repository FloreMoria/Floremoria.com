import { notFound } from 'next/navigation';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';
import { getPartnerCommissionSummary } from '@/lib/financial/partnerCommissionRegister';
import PartnerCommissionPanel from '@/components/dashboard/PartnerCommissionPanel';
import { ArrowLeft, Building2 } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const agency = await prisma.partner.findFirst({
        where: { id, deletedAt: null, partnerType: 'FUNERAL_AGENCY' },
        select: { shopName: true },
    });
    return {
        title: agency?.shopName ? `Scheda Agenzia (${agency.shopName})` : 'Scheda Agenzia',
    };
}

export default async function AgencyDossierPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const testModeActive = await getDashboardTestModeActive();

    const agency = await prisma.partner.findFirst({
        where: {
            id,
            deletedAt: null,
            partnerType: 'FUNERAL_AGENCY',
        },
        include: {
            defaultFlorist: { select: { id: true, shopName: true } },
        },
    });

    if (!agency) return notFound();

    const summary = await getPartnerCommissionSummary(id, testModeActive);
    if (!summary) return notFound();

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in space-y-6">
            <Link
                href="/dashboard/agenzie"
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
                <ArrowLeft size={16} /> Torna alle agenzie
            </Link>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="rounded-full bg-gray-100 p-3">
                        <Building2 className="text-gray-700" size={22} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-display font-bold text-gray-900">{agency.shopName}</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {agency.partnershipChannel || 'Canale non impostato'}
                            {agency.defaultFlorist ? ` · Fiorista: ${agency.defaultFlorist.shopName}` : ''}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
                            {agency.agencyNotificationEmail ? (
                                <span>Email agenzia: {agency.agencyNotificationEmail}</span>
                            ) : null}
                            {agency.uniqueCode ? <span>Codice: {agency.uniqueCode}</span> : null}
                        </div>
                        <div className="mt-4 flex gap-3">
                            <Link
                                href={`/dashboard/orders?agencyId=${encodeURIComponent(agency.id)}`}
                                className="text-sm font-semibold text-gray-800 hover:underline"
                            >
                                Vedi ordini collegati
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <PartnerCommissionPanel
                partnerId={agency.id}
                partnerName={agency.shopName}
                initialSummary={summary}
            />
        </div>
    );
}
