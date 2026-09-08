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

    // Aliquota: solo 10 | 22 | null (vuoto). Nessun default di comodo.
    if ('vatRatePercent' in data || 'vatRate' in data) {
        const raw = data.vatRatePercent !== undefined ? data.vatRatePercent : data.vatRate;
        if (raw === null || raw === '' || raw === undefined) {
            updateData.vatRatePercent = null;
        } else {
            const n = Number(raw);
            if (n !== 10 && n !== 22) {
                throw new Error('Aliquota IVA ammessi solo 10 o 22 (oppure vuoto)');
            }
            updateData.vatRatePercent = n;
        }
    }

    if ('floristStandardCostCents' in data || 'floristStandardCostEur' in data) {
        if (data.floristStandardCostCents !== undefined) {
            if (data.floristStandardCostCents === null || data.floristStandardCostCents === '') {
                updateData.floristStandardCostCents = null;
            } else {
                const cents = parseInt(String(data.floristStandardCostCents), 10);
                updateData.floristStandardCostCents = Number.isFinite(cents) ? cents : null;
            }
        } else if (data.floristStandardCostEur !== undefined) {
            if (data.floristStandardCostEur === null || data.floristStandardCostEur === '') {
                updateData.floristStandardCostCents = null;
            } else {
                const eur = Number(String(data.floristStandardCostEur).replace(',', '.'));
                updateData.floristStandardCostCents = Number.isFinite(eur)
                    ? Math.round(eur * 100)
                    : null;
            }
        }
    }

    return updateData;
}
