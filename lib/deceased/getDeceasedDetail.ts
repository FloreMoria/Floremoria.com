import prisma from '@/lib/prisma';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';

const orderDetailInclude = {
    items: { include: { product: true } },
    deliveryProof: true,
    partner: { select: { id: true, shopName: true, ownerName: true, whatsappNumber: true } },
    user: { select: { id: true, name: true, email: true, phone: true } },
} as const;

export type DeceasedDetailPayload = {
    kind: 'profile' | 'orphan';
    deceasedProfileId: string | null;
    fullName: string;
    photoUrl: string | null;
    cemeteryCity: string;
    cemeteryName: string | null;
    verifiedNotes: string | null;
    birthDate: string | null;
    deathDate: string | null;
    gravePosition: string | null;
    floristPartnerId: string | null;
    floristName: string | null;
    linkedUsers: Array<{
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        relationship: string | null;
    }>;
    orders: Array<{
        id: string;
        orderNumber: string | null;
        status: string;
        createdAt: string;
        deliveryDate: string | null;
        cemeteryName: string;
        cemeteryCity: string;
        gravePosition: string | null;
        deceasedName: string;
        deceasedBirthDate: string | null;
        deceasedDeathDate: string | null;
        additionalInstructions: string | null;
        latitude: number | null;
        longitude: number | null;
        totalPriceCents: number;
        partner: { id: string; shopName: string; ownerName: string } | null;
        user: { id: string; name: string | null; email: string | null; phone: string | null } | null;
        items: Array<{ id: string; quantity: number; priceCents: number; productId: string; product: { id: string; name: string } }>;
        deliveryProof: {
            photoBeforeUrl: string | null;
            photoAfterUrl: string | null;
            photosBeforeUrls: string[];
            photosAfterUrls: string[];
            gpsLatitude: number | null;
            gpsLongitude: number | null;
        } | null;
        photos: string[];
    }>;
};

function serializeOrder(order: Awaited<ReturnType<typeof fetchProfileOrders>>[number]) {
    return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        deliveryDate: order.deliveryDate?.toISOString() ?? null,
        cemeteryName: order.cemeteryName,
        cemeteryCity: order.cemeteryCity,
        gravePosition: order.gravePosition,
        deceasedName: order.deceasedName,
        deceasedBirthDate: order.deceasedBirthDate?.toISOString() ?? null,
        deceasedDeathDate: order.deceasedDeathDate?.toISOString() ?? null,
        additionalInstructions: order.additionalInstructions,
        latitude: order.latitude,
        longitude: order.longitude,
        totalPriceCents: order.totalPriceCents,
        partner: order.partner,
        user: order.user,
        items: order.items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            priceCents: item.priceCents,
            productId: item.productId,
            product: { id: item.product.id, name: item.product.name },
        })),
        deliveryProof: order.deliveryProof
            ? {
                  photoBeforeUrl: order.deliveryProof.photoBeforeUrl,
                  photoAfterUrl: order.deliveryProof.photoAfterUrl,
                  photosBeforeUrls: order.deliveryProof.photosBeforeUrls,
                  photosAfterUrls: order.deliveryProof.photosAfterUrls,
                  gpsLatitude: order.deliveryProof.gpsLatitude,
                  gpsLongitude: order.deliveryProof.gpsLongitude,
              }
            : null,
        photos: order.photos,
    };
}

async function fetchProfileOrders(deceasedProfileId: string) {
    return prisma.order.findMany({
        where: {
            deceasedProfileId,
            ...visibleDashboardOrdersWhere(),
        },
        orderBy: { createdAt: 'desc' },
        include: orderDetailInclude,
    });
}

export async function getDeceasedProfileDetail(deceasedProfileId: string): Promise<DeceasedDetailPayload | null> {
    const profile = await prisma.deceasedProfile.findUnique({
        where: { id: deceasedProfileId },
        include: {
            userLinks: {
                include: {
                    user: { select: { id: true, name: true, email: true, phone: true } },
                },
            },
            partnerLinks: {
                where: { isPrimary: true },
                include: {
                    partner: { select: { id: true, shopName: true, deletedAt: true } },
                },
                take: 1,
            },
        },
    });

    if (!profile) return null;

    const orders = await fetchProfileOrders(profile.id);
    const latest = orders[0];
    const florist = profile.partnerLinks.find((l) => l.partner.deletedAt == null)?.partner ?? null;

    return {
        kind: 'profile',
        deceasedProfileId: profile.id,
        fullName: profile.fullName,
        photoUrl: profile.photoUrl ?? null,
        cemeteryCity: profile.cemeteryCity,
        cemeteryName: profile.cemeteryName,
        verifiedNotes: profile.verifiedNotes,
        birthDate: latest?.deceasedBirthDate?.toISOString() ?? null,
        deathDate: latest?.deceasedDeathDate?.toISOString() ?? null,
        gravePosition: latest?.gravePosition ?? null,
        floristPartnerId: florist?.id ?? null,
        floristName: florist?.shopName ?? null,
        linkedUsers: profile.userLinks.map((link) => ({
            id: link.user.id,
            name: link.user.name,
            email: link.user.email,
            phone: link.user.phone,
            relationship: link.relationship,
        })),
        orders: orders.map(serializeOrder),
    };
}

export async function getOrphanDeceasedDetail(seedOrderId: string): Promise<DeceasedDetailPayload | null> {
    const seed = await prisma.order.findFirst({
        where: {
            id: seedOrderId,
            deceasedProfileId: null,
            ...visibleDashboardOrdersWhere(),
        },
        select: {
            deceasedName: true,
            cemeteryCity: true,
            cemeteryName: true,
        },
    });

    if (!seed) return null;

    const orders = await prisma.order.findMany({
        where: {
            deceasedProfileId: null,
            deceasedName: seed.deceasedName,
            cemeteryCity: seed.cemeteryCity,
            cemeteryName: seed.cemeteryName,
            ...visibleDashboardOrdersWhere(),
        },
        orderBy: { createdAt: 'desc' },
        include: orderDetailInclude,
    });

    const latest = orders[0];

    return {
        kind: 'orphan',
        deceasedProfileId: null,
        fullName: seed.deceasedName,
        photoUrl: null,
        cemeteryCity: seed.cemeteryCity,
        cemeteryName: seed.cemeteryName,
        verifiedNotes: null,
        birthDate: latest?.deceasedBirthDate?.toISOString() ?? null,
        deathDate: latest?.deceasedDeathDate?.toISOString() ?? null,
        gravePosition: latest?.gravePosition ?? null,
        floristPartnerId: null,
        floristName: null,
        linkedUsers: [],
        orders: orders.map(serializeOrder),
    };
}
