'use client';
import React, { useState } from 'react';
import { buildProductAlt } from '@/utils/altText';
import Image from 'next/image';
import Link from 'next/link';
import ProductHoverPreview from './ProductHoverPreview';
import { Product } from '@/lib/products';

interface ProductCardProps {
    product: Product;
    comuneSlug?: string;
    comuneName?: string;
}

export default function ProductCard({ product, comuneSlug, comuneName }: ProductCardProps) {
    const productUrl = comuneSlug
        ? `/fiori-sulle-tombe/${product.slug}?loc=${comuneSlug}`
        : `/fiori-sulle-tombe/${product.slug}`;

    // Read deeply directly from the filesystem populated array
    const [imgSrc, setImgSrc] = useState(product.coverImage || '');
    const [hasError, setHasError] = useState(!product.coverImage);

    return (
        <article className="bg-white rounded-[24px] shadow-sm border border-gray-100 hover:shadow-2xl transition-shadow flex flex-col h-[500px] min-h-[500px] hover:z-50 relative group">
            <Link href={productUrl} className="w-full h-[85%] relative bg-gray-50 flex items-center justify-center text-center overflow-hidden rounded-t-[24px] cursor-pointer group-hover:opacity-40 transition-opacity duration-500">
                {!hasError ? (
                    <>
                        {(() => { console.log("Tentativo caricamento immagine per:", product.slug, "Path:", imgSrc); return null; })()}
                        <Image
                            src={imgSrc}
                            alt={buildProductAlt(product, { context: 'card', municipalityName: comuneName })}
                            fill
                            className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            loading="lazy"
                            onError={() => {
                                console.error(`ERRORE IMMAGINE CARD: ${product.slug} all'URL ${imgSrc}`);
                                setTimeout(() => setHasError(true), 0);
                            }}
                        />
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center p-4">
                        <svg className="w-12 h-12 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        <span className="text-fm-muted text-xs font-medium px-4">Immagine FloreMoria in elaborazione</span>
                    </div>
                )}
            </Link>
            <div className="h-[15%] w-full flex items-center justify-between px-5 bg-white/90 backdrop-blur-xl border-t border-gray-100/50 rounded-b-[24px] group-hover:opacity-40 transition-opacity duration-500">
                <div className="flex flex-col min-w-0 pr-4 py-1">
                    <h3 className="text-[18px] font-display font-bold text-gray-900 tracking-tight truncate">
                        {product.name}
                    </h3>
                    <p className="text-fm-gold font-semibold text-[17px] mt-0.5 tracking-tight opacity-75">
                        €{product.price.toFixed(2)}
                    </p>
                </div>
                <Link href={productUrl} className="shrink-0 bg-fm-gold text-white px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide hover:brightness-110 transition-colors shadow-sm">
                    {comuneSlug ? 'Vedi' : 'Dettagli'}
                </Link>
            </div>

            {/* Hover Preview Box with Floating asymmetric positioning */}
            <ProductHoverPreview product={product} selectedImage={imgSrc} />
        </article>
    );
}
