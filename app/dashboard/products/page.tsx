import React from 'react';
import { PrismaClient } from '@prisma/client';
import ClientProductsTable from './ClientProductsTable';
import { getImagesFromFilesystem } from '@/lib/getImages';
import {
    loadSoldUnitsByProductId,
    unitMarginCents,
    type SoldUnitsPeriod,
} from '@/lib/products/productCatalogMetrics';

const prisma = new PrismaClient();

export const metadata = {
    title: 'Catalogo Prodotti',
};

// Forziamo dinamicità per evitare la cache di build (così i DB live si vedono subito)
export const dynamic = 'force-dynamic';

export default async function ProductsPage({
    searchParams,
}: {
    searchParams?: Promise<{ soldPeriod?: string }>;
}) {
    const sp = (await searchParams) || {};
    const soldPeriodRaw = sp.soldPeriod || 'year';
    const soldPeriod: SoldUnitsPeriod =
        soldPeriodRaw === 'last12m' || soldPeriodRaw === 'all' || soldPeriodRaw === 'year'
            ? soldPeriodRaw
            : 'year';

    const [products, categories, soldByProduct] = await Promise.all([
        prisma.product.findMany({
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            include: {
                category: true,
                images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            },
        }),
        prisma.category.findMany({
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
        }),
        loadSoldUnitsByProductId(soldPeriod),
    ]);

    const missingVatCount = products.filter(
        (p) => p.vatRatePercent !== 10 && p.vatRatePercent !== 22
    ).length;

    const productsWithManifest = products.map((product) => {
        const soldUnits = soldByProduct.get(product.id) ?? 0;
        const marginUnit = unitMarginCents({
            basePriceCents: product.basePriceCents,
            vatRatePercent: product.vatRatePercent,
            floristStandardCostCents: product.floristStandardCostCents,
        });
        return {
            ...product,
            manifestCover: getImagesFromFilesystem(product.slug)[0] ?? null,
            soldUnits,
            unitMarginCents: marginUnit,
            totalMarginCents: marginUnit == null ? null : marginUnit * soldUnits,
        };
    });

    return (
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex items-center justify-between mb-8 border-b border-gray-100 pb-6">
                <div>
                    <h1 className="text-[28px] font-semibold text-black tracking-tight">
                        Catalogo Prodotti
                    </h1>
                    <p className="text-gray-500 text-[15px] mt-1">
                        Gestisci bouquet, corone, prezzi, aliquota IVA e costo standard fiorista.
                        Venduti e margini sono calcolati dagli ordini a ogni caricamento.
                    </p>
                    {missingVatCount > 0 ? (
                        <p className="mt-2 text-[13px] font-medium text-amber-700">
                            {missingVatCount} prodot{missingVatCount === 1 ? 'to' : 'ti'} senza
                            aliquota IVA — da compilare a mano prima della Fase 3 corrispettivi.
                        </p>
                    ) : null}
                </div>
            </header>

            <ClientProductsTable
                initialProducts={productsWithManifest}
                initialCategories={categories}
                initialSoldPeriod={soldPeriod}
            />
        </div>
    );
}
