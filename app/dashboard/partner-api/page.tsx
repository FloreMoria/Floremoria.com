import prisma from '@/lib/prisma';
import PartnerApiCredentialsClient, {
    type CredentialRow,
    type PartnerOption,
} from '@/components/dashboard/PartnerApiCredentialsClient';

export const dynamic = 'force-dynamic';

export default async function PartnerApiPage() {
    const [partnersRaw, credsRaw] = await Promise.all([
        prisma.partner.findMany({
            where: { deletedAt: null },
            orderBy: { shopName: 'asc' },
            select: { id: true, shopName: true, uniqueCode: true },
        }),
        prisma.partnerApiCredential.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                partner: { select: { id: true, shopName: true, uniqueCode: true } },
            },
        }),
    ]);

    const partners: PartnerOption[] = partnersRaw.map((p) => ({
        id: p.id,
        shopName: p.shopName,
        uniqueCode: p.uniqueCode,
    }));

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
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20">
            <PartnerApiCredentialsClient partners={partners} initialCredentials={initialCredentials} />
        </div>
    );
}
