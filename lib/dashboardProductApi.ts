/** Campi ammessi in scrittura su Product — evita errori Prisma da payload client. */
export function buildProductUpdateData(data: Record<string, unknown>) {
    const mediaUrlRaw = data.mediaUrl ?? data.imageUrl ?? data.image;
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined && data.name !== null) {
        updateData.name = String(data.name);
        updateData.slug =
            (typeof data.slug === 'string' && data.slug) ||
            String(data.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    } else if (typeof data.slug === 'string' && data.slug) {
        updateData.slug = data.slug;
    }

    if (data.shortDescription !== undefined) {
        updateData.shortDescription = data.shortDescription || null;
    }
    if (data.description !== undefined) {
        updateData.description = data.description || null;
    }
    if (data.basePriceCents !== undefined) {
        updateData.basePriceCents = parseInt(String(data.basePriceCents), 10);
    }
    if (data.categoryId !== undefined) {
        updateData.categoryId = data.categoryId;
    }
    if (data.isActive !== undefined) {
        updateData.isActive = Boolean(data.isActive);
    }
    if (data.isBouquet !== undefined) {
        updateData.isBouquet = Boolean(data.isBouquet);
    }
    if (data.sortOrder !== undefined) {
        updateData.sortOrder = parseInt(String(data.sortOrder), 10);
    }
    if (mediaUrlRaw !== undefined) {
        const trimmed = typeof mediaUrlRaw === 'string' ? mediaUrlRaw.trim() : '';
        updateData.mediaUrl = trimmed || null;
    }

    return updateData;
}
