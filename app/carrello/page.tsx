'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { products } from '@/lib/products';

export default function CartPage() {
    interface CartItem {
        productId: string;
        slug: string;
        name: string;
        priceCents: number;
        qty: number;
        customData?: {
            comune?: string;
            nome?: string;
            cognome?: string;
            dataConsegna?: string;
            variantColor?: string;
        };
    }

    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const cartStr = localStorage.getItem('fm_cart');
        if (cartStr) {
            try {
                const parsedCart = JSON.parse(cartStr);
                setCartItems(parsedCart);
            } catch (e) {
                console.error("Failed to parse cart", e);
            }
        }
        setIsLoaded(true);
    }, []);

    const handleRemove = (index: number) => {
        const updatedCart = [...cartItems];
        updatedCart.splice(index, 1);
        setCartItems(updatedCart);
        localStorage.setItem('fm_cart', JSON.stringify(updatedCart));
    };

    if (!isLoaded) {
        return <div className="min-h-[60vh] flex items-center justify-center">Caricamento in corso...</div>;
    }

    const hasBouquet = cartItems.some(item => {
        const p = products.find(prod => prod.id === item.productId);
        return p?.isBouquet === true;
    });

    return (
        <div className="max-w-4xl mx-auto px-4 py-20 lg:py-32 min-h-[70vh]">
            <h1 className="text-4xl font-display font-semibold text-fm-text mb-8">
                Il tuo Carrello
            </h1>

            {cartItems.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-gray-100 shadow-sm">
                    <div className="w-16 h-16 bg-fm-cta-soft/50 rounded-full flex items-center justify-center mx-auto mb-6 text-fm-cta">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <p className="text-lg text-fm-muted mb-6">Il tuo carrello è vuoto.</p>
                    <Link href="/fiori-sulle-tombe" className="inline-block bg-fm-cta hover:bg-fm-cta-hover text-white font-medium px-8 py-3 rounded-xl transition-all shadow-sm">
                        Vai agli omaggi floreali
                    </Link>
                </div>
            ) : (
                <div className="space-y-6">
                    {cartItems.map((item, idx) => (
                        <div key={idx} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex-1">
                                <h3 className="text-xl font-semibold text-fm-text mb-1">{item.name}</h3>
                                {item.customData && (
                                    <div className="text-sm text-fm-muted space-y-1 mt-3">
                                        {item.customData.variantColor && <p><strong>Colore:</strong> {item.customData.variantColor}</p>}
                                        {item.customData.comune && <p><strong>Comune/Cimitero:</strong> {item.customData.comune}</p>}
                                        {item.customData.nome && <p><strong>Defunto:</strong> {item.customData.nome} {item.customData.cognome}</p>}
                                        {item.customData.dataConsegna && <p><strong>Consegna:</strong> {item.customData.dataConsegna}</p>}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-between w-full md:w-auto gap-8">
                                <div className="text-right">
                                    <p className="font-semibold text-lg text-fm-text">
                                        {item.qty} x €{(item.priceCents / 100).toFixed(2)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleRemove(idx)}
                                    className="text-fm-rose hover:text-red-700 p-2 rounded-md hover:bg-fm-rose-soft/30 transition-colors"
                                    aria-label="Rimuovi"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                    ))}

                    {!hasBouquet && cartItems.length > 0 && (
                        <div className="bg-red-50 text-fm-rose p-4 rounded-xl border border-red-100 text-sm md:text-base font-medium flex items-start gap-3 mt-4 shadow-sm">
                            <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            <p>
                                Attenzione: gli accessori (come Lumino, Messaggio, ecc.) possono essere acquistati solo in abbinamento a un omaggio floreale principale.
                                <Link href="/fiori-sulle-tombe" className="underline font-bold ml-1 hover:text-red-800">Aggiungi un fiore</Link>.
                            </p>
                        </div>
                    )}

                    <div className="bg-fm-section rounded-2xl p-6 border border-fm-rose-soft/30 flex flex-col sm:flex-row justify-between items-center gap-6 mt-8">
                        <div>
                            <p className="text-fm-muted text-sm uppercase tracking-wide font-semibold">Totale Carrello</p>
                            <p className="text-2xl font-bold text-fm-text mt-1">
                                €{(cartItems.reduce((acc, curr) => acc + (curr.priceCents * curr.qty), 0) / 100).toFixed(2)}
                            </p>
                        </div>
                        {hasBouquet ? (
                            <Link href="/checkout" className="w-full sm:w-auto min-w-[200px] text-center bg-fm-cta hover:bg-fm-cta-hover text-white font-medium px-8 py-4 rounded-xl transition-all shadow-md">
                                Procedi al Checkout
                            </Link>
                        ) : (
                            <button disabled className="w-full sm:w-auto min-w-[200px] text-center bg-gray-300 text-gray-500 font-medium px-8 py-4 rounded-xl cursor-not-allowed">
                                Procedi al Checkout
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
