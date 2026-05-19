import prisma from '@/lib/prisma';
import ClientB2BPartnersTable from './ClientB2BPartnersTable';
import { type CredentialRow } from '@/components/dashboard/PartnerApiCredentialsClient';

export const dynamic = 'force-dynamic';

export default async function B2BPartnersPage() {
    const [partners, credsRaw] = await Promise.all([
        prisma.partner.findMany({
            where: { deletedAt: null, isB2B: true },
            orderBy: { shopName: 'asc' },
            include: {
                orders: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        user: true,
                        items: { include: { product: true } }
                    }
                },
                apiCredentials: true
            }
        }),
        prisma.partnerApiCredential.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                partner: { select: { id: true, shopName: true, uniqueCode: true } }
            }
        })
    ]);

    const initialCredentials: CredentialRow[] = credsRaw.map((r) => ({
        id: r.id,
        label: r.label,
        publicId: r.publicId,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
        revokedAt: r.revokedAt?.toISOString() ?? null,
        lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
        partner: r.partner,
    }));

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Florem B2B Hub (Gestione Partner)</h1>
                    <p className="text-gray-500 font-medium">
                        Gestisci le integrazioni esterne, i partner commerciali B2B e le loro credenziali API per la ricezione degli ordini.
                    </p>
                </div>
            </div>

            <ClientB2BPartnersTable initialPartners={partners} initialCredentials={initialCredentials} />
        </div>
    );
}
