import React from 'react';
import ProductCard from '@/components/ProductCard';
import { Product } from '@/lib/products';

interface ProductGridProps {
    products: Product[];
    comuneSlug?: string;
    comuneName?: string;
    /** Quattro colonne compatte (es. accessori Piccoli Amici). */
    layout?: 'default' | 'accessoryRow' | 'twoPerRow';
}

export default function ProductGrid({ products, comuneSlug, comuneName, layout = 'default' }: ProductGridProps) {
    const isAccessoryRow = layout === 'accessoryRow';
    const isTwoPerRow = layout === 'twoPerRow';
    const useCompactCard = isAccessoryRow || isTwoPerRow;

    return (
        <section className={isAccessoryRow ? 'mx-auto w-full max-w-5xl' : 'mx-auto w-full max-w-6xl'}>
            <div
                className={
                    isAccessoryRow
                        ? 'grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3 md:gap-4'
                        : isTwoPerRow
                          ? 'grid grid-cols-2 gap-3 sm:gap-4 md:gap-5'
                          : 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'
                }
            >
                {products.map((product) => (
                    <ProductCard
                        key={product.id}
                        product={product}
                        comuneSlug={comuneSlug}
                        comuneName={comuneName}
                        compact={useCompactCard}
                    />
                ))}
            </div>
        </section>
    );
}
