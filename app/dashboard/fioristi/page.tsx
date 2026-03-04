import prisma from '@/lib/prisma';
import ClientPartnersTable from './ClientPartnersTable';
export const dynamic = 'force-dynamic';

export default async function PartnersPage() {
    const partners = await prisma.partner.findMany({
        where: { deletedAt: null },
        orderBy: { shopName: 'asc' },
    });

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Fioristi</h1>
                <p className="text-gray-500 font-medium">
                    Gestisci la rete operativa di fiorai sul territorio. Predisposto per le automazioni WhatsApp.
                </p>
            </div>

            <ClientPartnersTable initialPartners={partners} />
        </div>
    );
}
