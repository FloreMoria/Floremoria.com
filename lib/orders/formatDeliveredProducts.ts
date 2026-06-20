export type OrderItemWithProduct = {
    quantity: number;
    product: { name: string; isBouquet: boolean };
};

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
