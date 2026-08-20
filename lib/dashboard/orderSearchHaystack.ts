/**
 * Ricerca generica Coda Ordini: haystack normalizzato (accenti, multi-token AND).
 */

export function normalizeOrderSearchQuery(value: string): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s./+-]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatSearchDate(raw: string | Date | null | undefined): string {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    const yy = yyyy.slice(-2);
    // Varianti comuni in IT: 20/08/2026, 20-08-2026, 2026-08-20, 20 ago
    const monthShort = d
        .toLocaleDateString('it-IT', { month: 'short' })
        .replace('.', '')
        .toLowerCase();
    return [
        `${dd}/${mm}/${yyyy}`,
        `${dd}-${mm}-${yyyy}`,
        `${dd}.${mm}.${yyyy}`,
        `${yyyy}-${mm}-${dd}`,
        `${dd}/${mm}/${yy}`,
        `${dd} ${monthShort}`,
        `${dd} ${monthShort} ${yyyy}`,
        d.toLocaleDateString('it-IT'),
    ].join(' ');
}

type StatusMap = Record<string, { label: string }>;

/**
 * Concatena i campi cercabili di un ordine (defunto, luogo, fiorista, bouquet, stato, date…).
 */
export function buildOrderSearchHaystack(
    order: {
        id?: string;
        orderNumber?: string | null;
        deceasedName?: string | null;
        buyerFullName?: string | null;
        buyerEmail?: string | null;
        buyerCity?: string | null;
        buyerCountry?: string | null;
        customerPhone?: string | null;
        cemeteryName?: string | null;
        cemeteryCity?: string | null;
        deliveryProvince?: string | null;
        gravePosition?: string | null;
        agencyName?: string | null;
        additionalInstructions?: string | null;
        status?: string | null;
        totalPriceCents?: number | null;
        createdAt?: string | Date | null;
        deliveryDate?: string | Date | null;
        funeralDate?: string | Date | null;
        updatedAt?: string | Date | null;
        partner?: {
            shopName?: string | null;
            ownerName?: string | null;
            province?: string | null;
            coverageArea?: string | null;
        } | null;
        items?: Array<{
            product?: { name?: string | null; slug?: string | null; shortDescription?: string | null } | null;
        }> | null;
    },
    statusMap?: StatusMap
): string {
    const statusKey = order.status || '';
    const statusLabel = statusMap?.[statusKey]?.label || statusKey;
    const productBits = (order.items || [])
        .map((item) =>
            [item.product?.name, item.product?.slug, item.product?.shortDescription]
                .filter(Boolean)
                .join(' ')
        )
        .join(' ');

    const price =
        order.totalPriceCents != null
            ? `${(order.totalPriceCents / 100).toFixed(2)} ${Math.round(order.totalPriceCents / 100)}`
            : '';

    const parts = [
        order.orderNumber,
        order.id,
        order.deceasedName,
        order.buyerFullName,
        order.buyerEmail,
        order.buyerCity,
        order.buyerCountry,
        order.customerPhone,
        order.cemeteryName,
        order.cemeteryCity,
        order.deliveryProvince,
        order.gravePosition,
        order.agencyName,
        order.additionalInstructions,
        statusKey,
        statusLabel,
        productBits,
        order.partner?.shopName,
        order.partner?.ownerName,
        order.partner?.province,
        order.partner?.coverageArea,
        price,
        formatSearchDate(order.createdAt),
        formatSearchDate(order.deliveryDate),
        formatSearchDate(order.funeralDate),
        formatSearchDate(order.updatedAt),
    ];

    return normalizeOrderSearchQuery(parts.filter(Boolean).join(' '));
}
