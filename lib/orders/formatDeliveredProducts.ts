export type OrderItemWithProduct = {
    quantity: number;
    product: { name: string; isBouquet: boolean };
};

export type OrderProductLine = {
    name: string;
    quantity: number;
};

export type OrderProductSummary = {
    mainProducts: OrderProductLine[];
    accessories: OrderProductLine[];
};

/** Bouquet principale vs accessori (lumino, bigliettino, foto prima della posa, ecc.). */
export function getOrderProductSummary(items: OrderItemWithProduct[]): OrderProductSummary {
    const toLine = (item: OrderItemWithProduct): OrderProductLine => ({
        name: item.product.name,
        quantity: item.quantity,
    });

    const mainProducts = items.filter((item) => item.product.isBouquet).map(toLine);
    const accessories = items.filter((item) => !item.product.isBouquet).map(toLine);

    if (!mainProducts.length && items.length) {
        return { mainProducts: [toLine(items[0]!)], accessories };
    }

    return { mainProducts, accessories };
}

/** Riepilogo testuale bouquet + accessori per WhatsApp Futuria e dashboard. */
export function formatDeliveredProductsSummary(items: OrderItemWithProduct[]): string {
    if (!items.length) return 'composizione floreale';

    const formatItem = (item: OrderItemWithProduct) =>
        item.quantity > 1 ? `${item.product.name} (×${item.quantity})` : item.product.name;

    const bouquets = items.filter((item) => item.product.isBouquet);
    const accessories = items.filter((item) => !item.product.isBouquet);

    const mainLabel = bouquets.length
        ? bouquets.map(formatItem).join(', ')
        : formatItem(items[0]!);

    if (!accessories.length) return mainLabel;

    const accessoryLabel = accessories.map(formatItem).join(', ');
    return `${mainLabel} con ${accessoryLabel}`;
}
