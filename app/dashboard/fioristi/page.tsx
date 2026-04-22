import prisma from '@/lib/prisma';
import ClientPartnersTable from './ClientPartnersTable';

export const dynamic = 'force-dynamic';

export default async function PartnersPage() {
    const partners = await prisma.partner.findMany({
        where: { deletedAt: null },
        orderBy: { shopName: 'asc' },
        include: {
            orders: {
                orderBy: { createdAt: 'desc' },
                include: {
                    user: true,
                    items: { include: { product: true } }
                }
            }
        }
    });

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Florem Hub 2.0 (Rete Fioristi)</h1>
                    <p className="text-gray-500 font-medium">
                        Gestisci la rete operativa territoriale: Anagrafica, Ordini Assegnati, Prove Visive e Pagamenti in un unico ecosistema.
                    </p>
                </div>
            </div>

            <ClientPartnersTable initialPartners={partners} />
        </div>
    );
}
