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
    /** Card più basse e tipografia ridotta (es. accessori in riga da 4). */
    compact?: boolean;
}

export default function ProductCard({ product, comuneSlug, comuneName, compact = false }: ProductCardProps) {
    const productUrl = comuneSlug
        ? `/fiori-sulle-tombe/${product.slug}?loc=${comuneSlug}`
        : `/fiori-sulle-tombe/${product.slug}`;

    // Read deeply directly from the filesystem populated array
    const [imgSrc, setImgSrc] = useState(product.coverImage || '');
    const [hasError, setHasError] = useState(!product.coverImage);

    React.useEffect(() => {
        if (product.images && product.images.length > 0) {
            const randomIndex = Math.floor(Math.random() * product.images.length);
            setImgSrc(product.images[randomIndex]);
            setHasError(false);
        }
    }, [product]);

    return (
        <article
            className={`relative flex h-full flex-col border border-gray-100 bg-white shadow-sm transition-shadow hover:z-50 hover:shadow-2xl group ${
                compact
                    ? 'min-h-[300px] rounded-[18px] sm:min-h-[320px]'
                    : 'min-h-[500px] rounded-[24px]'
            }`}
        >
            <Link
                href={productUrl}
                className={`relative flex w-full flex-1 cursor-pointer items-center justify-center overflow-hidden bg-gray-50 text-center transition-opacity duration-500 group-hover:opacity-70 ${
                    compact ? 'min-h-[140px] rounded-t-[18px] sm:min-h-[160px]' : 'min-h-[240px] rounded-t-[24px]'
                }`}
            >
                {!hasError ? (
                    <>

                        <Image
                            src={imgSrc}
                            alt={buildProductAlt(product, { context: 'card', municipalityName: comuneName })}
                            fill
                            className={`object-center transition-transform duration-700 ${
                                compact
                                    ? 'object-cover group-hover:scale-105'
                                    : 'object-contain p-2'
                            }`}
                            sizes={
                                compact
                                    ? '(max-width: 640px) 50vw, 25vw'
                                    : '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
                            }
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
            <div
                className={`relative z-10 flex w-full shrink-0 items-start justify-between border-t border-gray-100/50 bg-white/90 backdrop-blur-xl ${
                    compact
                        ? 'gap-2 rounded-b-[18px] px-3 py-2.5 sm:px-3.5 sm:py-3'
                        : 'gap-3 rounded-b-[24px] px-5 py-3'
                }`}
            >
                <div className="min-w-0 flex-1 py-0.5">
                    <h3
                        className={`font-display font-bold leading-snug tracking-tight text-gray-900 break-words [overflow-wrap:anywhere] ${
                            compact ? 'text-[13px] sm:text-[14px]' : 'text-[18px]'
                        }`}
                    >
                        {product.name}
                    </h3>
                    <p
                        className={`mt-0.5 font-semibold tracking-tight text-fm-gold opacity-75 ${
                            compact ? 'text-[13px] sm:text-[14px]' : 'mt-1 text-[17px]'
                        }`}
                    >
                        €{product.price.toFixed(2)}
                    </p>
                </div>
                <Link
                    href={productUrl}
                    className={`mt-0.5 shrink-0 self-center rounded-full bg-fm-gold font-semibold tracking-wide text-white shadow-sm transition-colors hover:brightness-110 ${
                        compact ? 'px-2.5 py-1.5 text-[10px] sm:px-3 sm:py-2 sm:text-[11px]' : 'px-5 py-2.5 text-xs'
                    }`}
                >
                    {comuneSlug ? 'Vedi' : 'Dettagli'}
                </Link>
            </div>

            {!compact && <ProductHoverPreview product={product} selectedImage={imgSrc} />}
        </article>
    );
}
