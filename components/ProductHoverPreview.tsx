'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Product } from '@/lib/products';
import Image from 'next/image';
import { buildProductAlt } from '@/utils/altText';

interface ProductHoverPreviewProps {
    product: Product;
    selectedImage?: string;
}

export default function ProductHoverPreview({ product, selectedImage }: ProductHoverPreviewProps) {
    const previewRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<'right' | 'left'>('right');
    const [qty, setQty] = useState(1);
    const [isClosed, setIsClosed] = useState(false);
    const [toastMsg, setToastMsg] = useState('');

    const handleAddToCart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const cartStr = localStorage.getItem('fm_cart');
        const cart = cartStr ? JSON.parse(cartStr) : [];

        const existingItemIndex = cart.findIndex((item: { productId: string }) => item.productId === product.id);
        if (existingItemIndex >= 0) {
            cart[existingItemIndex].qty += qty;
        } else {
            cart.push({
                productId: product.id,
                slug: product.slug,
                name: product.name,
                priceCents: Math.round(product.price * 100),
                qty: qty
            });
        }

        localStorage.setItem('fm_cart', JSON.stringify(cart));
        window.dispatchEvent(new CustomEvent('cart-added', { detail: { name: product.name } }));

        setToastMsg('Aggiunto al carrello');
        setTimeout(() => setToastMsg(''), 2500);
    };

    const handleSaveForLater = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const itemToSave = {
            productId: product.id,
            slug: product.slug,
            name: product.name,
            qty: qty
            // Variant could be added here if managed in state
        };

        // MOCK: Verifica se l'utente è loggato (ad es. presenza di un token)
        const isAuthenticated = typeof window !== 'undefined' && !!localStorage.getItem('fm_user_token');

        if (isAuthenticated) {
            try {
                // Esempio di chiamata API
                const res = await fetch('/api/saved-items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(itemToSave)
                });

                if (!res.ok) throw new Error('API request failed');
                setToastMsg('Salvato nel tuo profilo.');
            } catch (error) {
                // Fallback: salva in coda per sincronizzazione successiva
                const queueStr = localStorage.getItem('fm_saved_queue');
                const queue = queueStr ? JSON.parse(queueStr) : [];

                // Evita duplicati nella coda
                if (!queue.find((i: { productId: string }) => i.productId === product.id)) {
                    queue.push(itemToSave);
                    localStorage.setItem('fm_saved_queue', JSON.stringify(queue));
                }
                setToastMsg('Salvato nel tuo profilo.');
            }
        } else {
            // Utente NON loggato -> usa sessionStorage
            const savedStr = sessionStorage.getItem('fm_saved_session');
            const saved = savedStr ? JSON.parse(savedStr) : [];

            if (!saved.find((i: { productId: string }) => i.productId === product.id)) {
                saved.push(itemToSave);
                sessionStorage.setItem('fm_saved_session', JSON.stringify(saved));
            }
            setToastMsg('Salvato per questa sessione.\nAccedi per ritrovarlo sempre.');
        }

        setTimeout(() => setToastMsg(''), 3000); // 3 secondi per leggere il messaggio lungo
    };

    // Position left/right logic removed, now it overlaps the card entirely
    useEffect(() => {
        const parent = previewRef.current?.parentElement;
        if (!parent) return;

        const handleMouseEnter = () => {
            setIsClosed(false);
        };

        parent.addEventListener('mouseenter', handleMouseEnter);
        return () => {
            parent.removeEventListener('mouseenter', handleMouseEnter);
        };
    }, []);

    return (
        <div
            ref={previewRef}
            className={`hidden lg:flex flex-col absolute z-[50] w-[75%] h-[75%] overflow-hidden bg-white/20 backdrop-blur-xl border border-white/20 rounded-[24px] shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible pointer-events-none group-hover:pointer-events-auto transition-all duration-300 delay-75 group-hover:delay-0 top-0 right-0 translate-x-[30%] -translate-y-[30%] ${isClosed ? '!opacity-0 !invisible pointer-events-none' : ''}`}
            aria-hidden="true"
        >

            <div className="relative z-10 w-full h-full flex flex-col p-5 pointer-events-auto">
                {/* TOAST overlay */}
                {toastMsg && (
                    <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-gray-900/90 text-white text-[12px] px-5 py-2.5 rounded-xl z-[200] shadow-xl animate-fade-in font-medium whitespace-pre-line text-center leading-relaxed w-max max-w-[90%]">
                        {toastMsg}
                    </div>
                )}

                {/* 1) HEADER (top band) */}
                <div className="flex-none flex items-start justify-between pb-2">
                    <h4 className="flex-1 text-[16px] font-display font-semibold text-fm-text truncate pr-2 pt-1">
                        {product.name}
                    </h4>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsClosed(true); }} className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-black transition-colors" aria-label="Chiudi">
                        ×
                    </button>
                </div>

                {/* 2) MIDDLE ZONE */}
                <div className="w-full flex-grow flex gap-5 my-auto relative min-h-0">
                    {/* Vertical Divider line */}
                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-200/60 -translate-x-1/2"></div>

                    {/* LEFT COLUMN */}
                    <div className="w-1/2 flex flex-col pt-1">
                        <div className="w-full aspect-square bg-gray-50 rounded-xl relative overflow-hidden border border-gray-200 flex items-center justify-center text-center">
                            {selectedImage ? (
                                <Image
                                    src={selectedImage}
                                    alt={buildProductAlt(product, { context: 'hover' })}
                                    fill
                                    className="object-cover"
                                    loading="lazy"
                                    sizes="250px"
                                />
                            ) : (
                                <span className="text-fm-muted text-xs font-medium px-2">Nessuna immagine</span>
                            )}
                        </div>
                        <p className="mt-3 text-[12px] text-fm-muted font-body line-clamp-3 leading-relaxed">
                            {product.shortDescription || "Un omaggio floreale curato dal fiorista locale, con foto di conferma su WhatsApp."}
                        </p>
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="w-1/2 flex flex-col justify-between pt-1">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-fm-muted uppercase tracking-wider block">
                                Seleziona la quantità
                            </label>
                            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg h-10 px-2 shadow-sm">
                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQty(Math.max(1, qty - 1)); }} className="text-gray-400 hover:text-fm-text font-medium text-lg w-6 flex items-center justify-center pb-0.5">-</button>
                                <span className="text-[14px] font-bold text-fm-text font-display">{qty}</span>
                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQty(Math.min(10, qty + 1)); }} className="text-gray-400 hover:text-fm-text font-medium text-lg w-6 flex items-center justify-center pb-0.5">+</button>
                            </div>
                        </div>
                        <div className="space-y-2.5 mt-auto">
                            <button onClick={handleSaveForLater} className="w-full h-10 border border-gray-200 text-fm-text text-[11px] font-bold rounded-lg hover:border-gray-300 hover:bg-white transition-colors uppercase tracking-wider shadow-sm">
                                Salva per dopo
                            </button>
                            <button onClick={handleAddToCart} className="w-full h-10 bg-fm-gold text-white text-[11px] font-bold rounded-lg hover:brightness-110 transition-colors shadow-md uppercase tracking-wider px-1">
                                AGGIUNGI AL CARRELLO
                            </button>
                        </div>
                    </div>
                </div>

                {/* 3) FOOTER (bottom band) */}
                <div className="flex-none flex items-end justify-center pt-2">
                    <p className="text-[11px] text-fm-muted font-medium">
                        Foto su WhatsApp • Consegna locale
                    </p>
                </div>
            </div>
        </div>
    );
}
