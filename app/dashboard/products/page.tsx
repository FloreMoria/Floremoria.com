import React from 'react';
import { PrismaClient } from '@prisma/client';
import ClientProductsTable from './ClientProductsTable';

const prisma = new PrismaClient();

export const metadata = {
    title: 'Catalogo Prodotti - FloreMoria Dashboard',
};

// Next.js config per forzare dinamicità se serve (export const dynamic = 'force-dynamic')
// In questo caso gestiamo il revalidation path sui server actions o routes

export default async function ProductsPage() {
    // 1. Fetching dati con Prisma
    const [products, categories] = await Promise.all([
        prisma.product.findMany({
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            include: { category: true } // Carichiamo la relazione
        }),
        prisma.category.findMany({
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' }
        })
    ]);

    return (
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex items-center justify-between mb-8 border-b border-gray-100 pb-6">
                <div>
                    <h1 className="text-[28px] font-semibold text-black tracking-tight">Catalogo Prodotti</h1>
                    <p className="text-gray-500 text-[15px] mt-1">
                        Gestisci bouquet, corone, prezzi e visibilità. Tutte le modifiche saranno immediatamente online.
                    </p>
                </div>
            </header>

            {/* Interactive Client Component */}
            <ClientProductsTable initialProducts={products} initialCategories={categories} />
        </div>
    );
}
