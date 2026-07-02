/** Campi precompilati per duplicare un ordine in modale dashboard. */
export type DuplicateOrderDraft = {
    orderCategory: string;
    deliveryProvince: string;
    buyerFullName: string;
    buyerEmail: string;
    buyerPhone: string;
    userId: string;
    deceasedProfileId: string;
    deceasedName: string;
    deceasedBirthDate: string;
    deceasedDeathDate: string;
    cemeteryName: string;
    cemeteryCity: string;
    gravePosition: string;
    deliveryDate: string;
    productId: string;
    priceCents: number | '';
    quantity: number;
    partnerId: string;
    status: string;
    partnerPaymentStatus: string;
    isRecurring: boolean;
    additionalInstructions: string;
    selectedAccessoryIds: string[];
    ticketMessage: string;
    sourceOrderNumber?: string;
};

function toDateInput(value: string | Date | null | undefined): string {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

function toDatetimeLocal(value: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function parseCategoryAndProvince(orderNumber?: string | null, fallbackProvince?: string | null) {
    let orderCategory = 'FT';
    let deliveryProvince = (fallbackProvince || 'MI').toUpperCase().slice(0, 2);

    if (orderNumber) {
        const parts = orderNumber.split('-');
        if (parts.length >= 4 && ['FT', 'FF', 'FA', 'FP'].includes(parts[0]!)) {
            orderCategory = parts[0]!;
            deliveryProvince = (parts[1] || deliveryProvince).toUpperCase().slice(0, 2);
        }
    }

    return { orderCategory, deliveryProvince };
}

function suggestNextDeliveryDate(sourceDate: string | Date | null | undefined, isRecurring: boolean): string {
    if (!sourceDate) return '';
    const d = sourceDate instanceof Date ? new Date(sourceDate) : new Date(sourceDate);
    if (Number.isNaN(d.getTime())) return '';

    if (isRecurring) {
        const next = new Date(d);
        next.setMonth(next.getMonth() + 1);
        return toDatetimeLocal(next);
    }

    return toDatetimeLocal(d);
}

function buildDuplicateNote(order: {
    orderNumber?: string | null;
    specialNotes?: string | null;
    additionalInstructions?: string | null;
}): string {
    const base =
        (order.specialNotes || order.additionalInstructions || '')
            .replace(/IMPORT_MANUALE:[^|]*\|?\s*/gi, '')
            .replace(/Duplicato da [A-Z]{2}-[A-Z]{2}-\d{2}-\d{3}\s*\|?\s*/gi, '')
            .trim();

    const tag = order.orderNumber
        ? `Duplicato da ${order.orderNumber}`
        : 'Duplicato da ordine esistente';

    return base ? `${tag} | ${base}` : tag;
}

/** Mappa un ordine dashboard → bozza per nuova consegna (nuovo codice al salvataggio). */
export function orderToDuplicateDraft(order: Record<string, any>): DuplicateOrderDraft {
    const { orderCategory, deliveryProvince } = parseCategoryAndProvince(
        order.orderNumber,
        order.deliveryProvince
    );

    const firstItem = order.items?.[0];
    const mainItem =
        order.items?.find((item: { product?: { isBouquet?: boolean } }) => item.product?.isBouquet !== false) ??
        firstItem;
    const productId = mainItem?.productId || mainItem?.product?.id || '';
    const accessoryItems =
        order.items?.filter(
            (item: { product?: { isBouquet?: boolean }; productId?: string }) =>
                item.product?.isBouquet === false && item.productId !== productId
        ) ?? [];
    const isRecurring = Boolean(order.isRecurring);

    const buyerEmail =
        order.buyerEmail && !String(order.buyerEmail).includes('@phone.floremoria.local')
            ? String(order.buyerEmail)
            : '';

    return {
        orderCategory,
        deliveryProvince,
        buyerFullName: order.buyerFullName || '',
        buyerEmail,
        buyerPhone: order.customerPhone || '',
        userId: order.userId || '',
        deceasedProfileId: order.deceasedProfileId || '',
        deceasedName: order.deceasedName || '',
        deceasedBirthDate: toDateInput(order.deceasedBirthDate),
        deceasedDeathDate: toDateInput(order.deceasedDeathDate),
        cemeteryName: order.cemeteryName || '',
        cemeteryCity: order.cemeteryCity === 'Non specificato' ? '' : order.cemeteryCity || '',
        gravePosition: order.gravePosition || '',
        deliveryDate: suggestNextDeliveryDate(order.deliveryDate, isRecurring),
        productId,
        priceCents: mainItem?.priceCents ?? '',
        quantity: mainItem?.quantity ?? 1,
        partnerId: order.partnerId || '',
        status: 'ACCEPTED',
        partnerPaymentStatus: order.partnerPaymentStatus || 'PAID',
        isRecurring,
        additionalInstructions: buildDuplicateNote(order),
        selectedAccessoryIds: accessoryItems
            .map((item: { productId?: string; product?: { id?: string } }) => item.productId || item.product?.id)
            .filter(Boolean) as string[],
        ticketMessage: order.ticketMessage ? String(order.ticketMessage) : '',
        sourceOrderNumber: order.orderNumber || undefined,
    };
}
