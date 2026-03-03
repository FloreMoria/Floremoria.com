'use client';

import React, { useState, useEffect } from 'react';
import Button from '@/components/Button';

interface OrderItem {
    productId: string;
    name: string;
    priceCents: number;
    qty: number;
}

export default function OrderCompletedPage() {
    const [purchasedBouquet, setPurchasedBouquet] = useState<OrderItem | null>(null);
    const [isSubscriptionEnabled, setIsSubscriptionEnabled] = useState(false);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsClient(true), 0);
        const subStr = localStorage.getItem('fm_sub');
        if (subStr === 'true') setIsSubscriptionEnabled(true);

        const cartStr = localStorage.getItem('fm_cart');
        if (cartStr) {
            try {
                const cart: OrderItem[] = JSON.parse(cartStr);
                const bouquet = cart.find(item =>
                    item.productId !== '5' && item.productId !== '6'
                );
                if (bouquet) {
                    setPurchasedBouquet(bouquet);
                }
            } catch (e) {
                // console.error("Error reading cart for order completed", e);
            }
        }
        return () => clearTimeout(timer);
    }, []);

    if (!isClient) return null;

    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 md:p-12 space-y-12">

            {/* INTESTAZIONE CONFERMA ORDINE */}
            <div className="text-center max-w-2xl mx-auto space-y-4 pt-12">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-green-200">
                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h1 className="text-4xl md:text-5xl font-display font-bold text-fm-text tracking-tight">
                    Ordine Completato!
                </h1>
                <p className="text-xl text-fm-muted font-body leading-relaxed">
                    Grazie per averci scelto. A breve riceverai un&apos;email di riepilogo. Un fiorista locale si occuperà della composizione e ti invierà la foto su WhatsApp dopo la consegna.
                </p>
            </div>

            {/* CONFERMA ABBONAMENTO SE ATTIVATO AL CHECKOUT */}
            {isSubscriptionEnabled && purchasedBouquet && (
                <div className="max-w-xl w-full mx-auto bg-green-50 rounded-2xl p-6 border border-green-200 animate-fade-in text-center shadow-sm">
                    <p className="text-green-800 font-semibold text-lg flex flex-col items-center gap-2">
                        <span className="text-2xl">✅</span>
                        Abbonamento mensile confermato per: {purchasedBouquet.name}
                    </p>
                    <p className="text-green-700 mt-2 font-medium">
                        Riceverai la foto ad ogni consegna mensile. Ti avviseremo 7 giorni prima di ogni addebito.
                    </p>
                </div>
            )}

            <div className="pt-8 text-center">
                <Button href="/" variant="secondary" className="px-8 font-semibold">
                    Torna alla Home
                </Button>
            </div>
        </div>
    );
}
