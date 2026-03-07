'use client';

import React, { useState, useEffect } from 'react';
import Button from '@/components/Button';
import { Camera, CheckCircle2, Download } from 'lucide-react';
import Image from 'next/image';

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

    // Order info
    const [orderId, setOrderId] = useState<string | null>(null);
    const [buyerPhone, setBuyerPhone] = useState<string | null>(null);
    const [deliveryProvince, setDeliveryProvince] = useState<string | null>(null);
    const [marginCents, setMarginCents] = useState<number>(0);

    useEffect(() => {
        const timer = setTimeout(() => setIsClient(true), 0);

        // Subscription checks
        const subStr = localStorage.getItem('fm_sub');
        if (subStr === 'true') setIsSubscriptionEnabled(true);

        // Parameters checks
        const params = new URLSearchParams(window.location.search);
        const urlOrderId = params.get('orderId');
        const urlPhone = params.get('phone');
        const urlMargin = params.get('margin');
        const urlProv = params.get('prov');

        setOrderId(urlOrderId);
        setBuyerPhone(urlPhone ? decodeURIComponent(urlPhone) : null);
        setDeliveryProvince(urlProv);

        // GA4 Sync: send margin (Not full value) for real conversion tracking
        if (urlMargin) {
            const marginValue = parseInt(urlMargin, 10);
            setMarginCents(marginValue);

            // Trigger purchase event
            if (typeof window !== 'undefined' && (window as any).gtag) {
                // To avoid sending double events if page refreshes
                const isSent = sessionStorage.getItem(`ga4_purchased_${urlOrderId}`);
                if (!isSent) {
                    (window as any).gtag('event', 'purchase', {
                        currency: 'EUR',
                        value: marginValue / 100,
                        transaction_id: urlOrderId,
                        items: [] // Invia i capi di margine reale
                    });
                    console.log(`[GA4 Sandbox] Sent purchase conversion with Margin Value = €${(marginValue / 100).toFixed(2)}`);
                    sessionStorage.setItem(`ga4_purchased_${urlOrderId}`, 'true');
                }
            }
        }

        // Parse Cart locally for subscription info
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
                // console.error("Error reading cart", e);
            }
        }

        return () => clearTimeout(timer);
    }, []);

    if (!isClient) return null;

    return (
        <div className="min-h-screen py-16 px-4 md:px-8 bg-[#F9F7F2] relative overflow-hidden flex flex-col items-center justify-center -mt-[84px] pt-[120px]">

            {/* Paper Texture Overlay */}
            <div
                className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-multiply"
                style={{
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")'
                }}>
            </div>

            <div className="max-w-2xl mx-auto w-full relative z-10 space-y-12 animate-fade-in pb-16 print:pb-0">

                {/* Print-Only Header */}
                <div className="hidden print:block text-center border-b border-gray-300 pb-8 mb-8">
                    <div className="text-fm-gold text-2xl font-serif italic mb-2">FloreMoria</div>
                    <p className="text-sm font-sans text-gray-500">Documento di riepilogo incarico floristico</p>
                </div>

                {/* Paper Header */}
                <div className="text-center space-y-6">
                    <div className="text-fm-gold mb-6 print:hidden">
                        {/* Calla icon in gold */}
                        <svg className="w-16 h-16 mx-auto opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22C12 22 20 18 20 12C20 6 12 2 12 2C12 2 4 6 4 12C4 18 12 22 12 22Z" />
                            <path d="M12 2v20" />
                            <path d="M12 12c-2.5-1.5-4-4-4-6" />
                        </svg>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-serif font-medium text-gray-900 tracking-tight leading-tight">
                        Il tuo omaggio floreale è in buone mani.
                    </h1>

                    <p className="text-lg md:text-xl text-gray-600 font-sans max-w-xl mx-auto">
                        Onoreremo il tuo caro con la massima cura e discrezione.
                    </p>

                    {/* Order Details Banner */}
                    {orderId && (
                        <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-4 pt-6">
                            <div className="bg-white/60 backdrop-blur-sm rounded-lg py-3 px-6 text-xl text-gray-800 border-2 border-dashed border-gray-300 shadow-sm flex flex-col items-center print:border-solid print:border-gray-400">
                                <span className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-1 font-sans">Sigillo di Garanzia</span>
                                <span className="font-mono font-bold tracking-wider">{orderId}</span>
                            </div>
                            {deliveryProvince && (
                                <div className="bg-white/60 backdrop-blur-sm rounded-lg py-3 px-6 text-xl text-gray-800 border border-gray-200 shadow-sm flex flex-col items-center">
                                    <span className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-1 font-sans">Provincia Consegna</span>
                                    <span className="font-serif font-bold text-fm-gold">{deliveryProvince}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* The Photo Promise */}
                <div className="bg-white/80 backdrop-blur-md rounded-2xl p-8 md:p-10 shadow-sm border border-gray-100 flex flex-col gap-6 relative overflow-hidden group print:bg-white print:border-gray-300 print:shadow-none">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-green-100/50 rounded-full blur-3xl -mr-16 -mt-16 transition-transform group-hover:scale-110 print:hidden"></div>

                    <div className="flex items-center gap-4 relative z-10 border-b border-gray-100 pb-6 print:border-gray-200">
                        <div className="bg-green-50 p-3 rounded-full text-green-600 shrink-0 border border-green-100 print:bg-transparent print:border-none print:p-0">
                            <Camera size={24} />
                        </div>
                        <h3 className="text-2xl font-serif font-bold text-gray-900">
                            Il servizio di verifica fotografica
                        </h3>
                    </div>

                    <div className="space-y-6 relative z-10">
                        <p className="text-gray-700 font-medium font-sans text-lg">
                            Come promesso, riceverai due fotografie della consegna direttamente su questo numero: {buyerPhone ? <strong className="font-mono text-fm-gold ml-1 text-xl">{buyerPhone}</strong> : 'il tuo cellulare'}.
                        </p>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="bg-gray-50/50 p-5 rounded-xl border border-gray-100">
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 size={22} className="text-green-500 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <strong className="block font-sans text-gray-900">Foto 1: Composizione</strong>
                                        <span className="text-gray-600 font-sans text-[15px] leading-snug block">Il dettaglio della composizione appena creata dal fiorista.</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50/50 p-5 rounded-xl border border-gray-100">
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 size={22} className="text-green-500 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <strong className="block font-sans text-gray-900">Foto 2: Consegna</strong>
                                        <span className="text-gray-600 font-sans text-[15px] leading-snug block">L'omaggio posizionato nel luogo del ricordo.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Subscription / Recurring confirmed */}
                {isSubscriptionEnabled && purchasedBouquet && (
                    <div className="bg-amber-50/80 rounded-2xl p-8 border border-amber-100 text-center shadow-sm backdrop-blur-md print:bg-white print:border-gray-300 print:shadow-none">
                        <p className="text-amber-900 font-serif font-bold text-xl flex justify-center items-center gap-3 mb-3">
                            <span className="text-2xl print:hidden">🌿</span>
                            Abbonamento Mensile Attivato
                        </p>
                        <p className="text-amber-800/80 font-sans text-lg max-w-lg mx-auto leading-relaxed">
                            Manteniamo vivo il ricordo per <strong className="font-serif italic text-amber-900">{purchasedBouquet.name}</strong>. Riceverai foto mensili e un preavviso 7 giorni prima di ogni rinnovo.
                        </p>
                    </div>
                )}

                {/* Print / Virtual Receipt & Home */}
                <div className="pt-12 flex flex-col md:flex-row items-center justify-center gap-4 print:hidden">
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-8 py-4 rounded-full text-gray-700 bg-white hover:bg-gray-50 font-sans font-semibold border-2 border-gray-200 hover:border-gray-300 transition-all shadow-sm"
                    >
                        <Download size={18} /> Scarica Riepilogo dell'ordine
                    </button>

                    <Button href="/" variant="primary" className="px-12 py-4 font-sans uppercase tracking-wider font-bold shadow-lg shadow-fm-cta/20">
                        Torna alla Home
                    </Button>
                </div>

                {/* Print-Only Footer */}
                <div className="hidden print:block text-center border-t border-gray-300 pt-8 mt-16 text-gray-500 text-sm font-sans">
                    Grazie per aver scelto FloreMoria. Questo documento attesta la presa in carico del servizio.
                    <br />www.floremoria.it
                </div>

            </div>
        </div>
    );
}
