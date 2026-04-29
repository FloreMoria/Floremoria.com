'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Product, products } from '@/lib/products';
import ProductCard from '@/components/ProductCard';
import CoreValues from '@/components/CoreValues';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getDailyImageSet } from '@/utils/dailyImageSet';
import { buildProductAlt } from '@/utils/altText';
import Link from 'next/link';

interface ProductClientViewProps {
    product: Product;
    relatedProducts: Product[];
    initialComune?: string;
}

export default function ProductClientView({ product, relatedProducts, initialComune = '' }: ProductClientViewProps) {
    const router = useRouter();
    const [qty, setQty] = useState(1);
    const [comune, setComune] = useState(initialComune);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
    const autocompleteRef = useRef<HTMLDivElement>(null);

    const addonsMapping: Record<string, { id: string, slug: string, name: string, price: number, icon: string }[]> = {
        'cimitero': [
            { id: 'c3', slug: 'messaggio', name: "Aggiungi Messaggio d'affetto", price: 2.49, icon: '✉️' },
            { id: 'c2', slug: 'lumino', name: "Aggiungi Lumino votivo", price: 3.49, icon: '🕯️' }
        ],
        'funerale': [
            { id: 'f4', slug: 'nastro-commemorativo', name: "Aggiungi Nastro personalizzato", price: 14.99, icon: '🎀' },
            { id: 'f5', slug: 'set-ceri', name: "Aggiungi Set Ceri solenni", price: 24.99, icon: '🕯️' }
        ],
        'animali': [
            { id: 'c3', slug: 'messaggio', name: "Bigliettino 'Oltre il Ponte'", price: 2.49, icon: '✉️' },
            { id: 'c2', slug: 'lumino', name: "Aggiungi Lumino del Ricordo", price: 3.49, icon: '🕯️' }
        ]
    };
    
    const availableAddons = product.isBouquet ? (addonsMapping[product.category] || []) : [];
    
    const addonsTotal = selectedAddons.reduce((acc, addonId) => {
        const addon = availableAddons.find(a => a.id === addonId);
        return acc + (addon ? addon.price : 0);
    }, 0);
    
    const totalPrice = (product.price * qty) + addonsTotal;

    // Fetch municipalities
    useEffect(() => {
        if (comune.length >= 2) {
            const timeoutId = setTimeout(() => {
                fetch(`/api/municipalities?q=${encodeURIComponent(comune)}`)
                    .then(res => res.json())
                    .then(data => {
                        setSuggestions(data);
                    }).catch(() => setSuggestions([]));
            }, 300);
            return () => clearTimeout(timeoutId);
        } else {
            setSuggestions([]);
        }
    }, [comune]);

    // Close suggestions on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const [customMessage, setCustomMessage] = useState('');
    const [variantColor, setVariantColor] = useState('Rosso');
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    // Mappatura dinamica per il colore del Bouquet delle rose
    useEffect(() => {
        if (product.slug === 'bouquet-di-rose' && typeof window !== 'undefined') {
            // Cerchiamo l'immagine che contiene il colore nella stringa del path orginale (es. rose-rosse)
            const searchMap: Record<string, string> = {
                'Rosso': 'ross',
                'Bianco': 'bianc',
                'Rosa': 'rosa',
                'Arancio': 'aranci',
                'Giallo': 'giall'
            };
            const matchQuery = searchMap[variantColor] || variantColor.toLowerCase();
            const matchingImg = sourceImages.find(img => img.toLowerCase().includes(matchQuery));
            if (matchingImg) {
                setMainImage(matchingImg);
            }
        }
    }, [variantColor, product.slug]);

    // Persistenza Dati Condivisi
    useEffect(() => {
        try {
            const savedStr = localStorage.getItem('fm_checkout_data');
            if (savedStr) {
                const parsed = JSON.parse(savedStr);
                if (parsed.comune && !initialComune) setComune(parsed.comune);
                if (parsed.customMessage) setCustomMessage(parsed.customMessage);
            }
        } catch (e) {
            console.error('Error parsing fm_checkout_data:', e);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const dataToSave = { comune, customMessage };
        localStorage.setItem('fm_checkout_data', JSON.stringify(dataToSave));
    }, [comune, customMessage]);

    // Gallery state
    const hasImages = product.images && product.images.length > 0;

    // We trust the images array generated natively by the Manifest reader script
    const sourceImages = hasImages ? product.images! : [];

    const daily = getDailyImageSet(product.id, sourceImages);
    const galleryImages = daily.gallery;

    const [displayImages, setDisplayImages] = useState<string[]>([]);
    const [mainImage, setMainImage] = useState<string | null>(null);

    useEffect(() => {
        if (galleryImages.length > 0) {
            setDisplayImages([...galleryImages]);
            const randomIndex = Math.floor(Math.random() * galleryImages.length);
            setMainImage(galleryImages[randomIndex]);
        } else {
            console.error(`ERRORE CRITICO CLIENT: Cartella /public/images/products/${product.slug} non trovata o vuota per la galleria di ${product.name}`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product.id]);

    const handleThumbnailClick = (imgSrc: string) => {
        setMainImage(imgSrc);
    };

    const increaseQty = () => setQty(prev => (prev < 10 ? prev + 1 : 10));
    const decreaseQty = () => setQty(prev => (prev > 1 ? prev - 1 : 1));

    const handleAddToCart = () => {

        const cartStr = localStorage.getItem('fm_cart');
        const cart = cartStr ? JSON.parse(cartStr) : [];

        // Check for accessory (isBouquet === false) validation
        if (product.isBouquet === false) {
            const hasBouquet = cart.some((item: any) => {
                const p = products.find(prod => prod.id === item.productId);
                return p?.isBouquet === true;
            });

            if (!hasBouquet) {
                alert("Attenzione: gli accessori (come Lumino, Messaggio, ecc.) possono essere acquistati solo come supplemento a un omaggio floreale. Aggiungi prima un fiore al carrello.");
                window.location.href = '/fiori-sulle-tombe';
                return;
            }
        }

        const existingItemIndex = cart.findIndex((item: { productId: string, customData?: Record<string, unknown> }) =>
            item.productId === product.id &&
            (product.slug === 'bouquet-di-rose' ? item.customData?.variantColor === variantColor : true)
        );

        if (existingItemIndex >= 0) {
            cart[existingItemIndex].qty += qty;
        } else {
            const newItem: Record<string, unknown> = {
                productId: product.id,
                slug: product.slug,
                name: product.name,
                priceCents: Math.round(product.price * 100),
                qty: qty,
                customData: {
                    comune,
                    ...(product.slug === 'bouquet-di-rose' ? { variantColor } : {}),
                    ...(product.slug === 'messaggio' || product.slug === 'nastro-commemorativo' ? { customMessage } : {})
                }
            };
            cart.push(newItem);
        }

        // Push addons
        selectedAddons.forEach(addonId => {
            const addonConfig = availableAddons.find(a => a.id === addonId);
            if (addonConfig) {
                const realProduct = products.find(p => p.id === addonId);
                if (realProduct) {
                    cart.push({
                        productId: realProduct.id,
                        slug: realProduct.slug,
                        name: addonConfig.name,
                        priceCents: Math.round(addonConfig.price * 100),
                        qty: 1, // Accessory qty is 1 per addition
                        customData: {
                            comune,
                            ...(realProduct.slug === 'messaggio' || realProduct.slug === 'nastro-commemorativo' ? { customMessage } : {})
                        }
                    });
                }
            }
        });

        localStorage.setItem('fm_cart', JSON.stringify(cart));
        window.dispatchEvent(new CustomEvent('cart-added', { detail: { name: product.name } }));
        // Change Purchase Flow: Navigate to Checkout
        window.location.href = '/checkout';
    };

    return (
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-12 space-y-8 lg:space-y-16">


            {/* HERO PRODOTTO - 2 COLONNE */}
            <div className="flex flex-col lg:flex-row gap-8 xl:gap-16 lg:items-start">

                {/* SX: Gallery, SEO Text */}
                <div className="lg:w-[45%] space-y-12 shrink-0">

                    {/* Bottone Indietro */}
                    <Link
                        href="/fiori-sulle-tombe"
                        className="flex items-center text-fm-text hover:text-fm-gold transition-colors font-medium text-[15px] w-fit group"
                    >
                        <svg className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Torna agli omaggi floreali
                    </Link>

                    {/* Gallery Reworked */}
                    <div className="flex flex-col space-y-3 w-full">
                        <div className="w-full aspect-[4/5] bg-gray-50 rounded-3xl shadow-sm border border-white/20 flex items-center justify-center text-fm-muted text-lg relative overflow-hidden transition-all duration-300">
                            {mainImage ? (
                                <>

                                    <Image
                                        src={mainImage}
                                        alt={buildProductAlt(product, { context: 'main', municipalityName: comune })}
                                        fill
                                        className="object-contain brightness-[1.02] saturate-[1.05] p-2"
                                        priority
                                        sizes="(max-width: 768px) 100vw, 50vw"
                                    />
                                </>
                            ) : (
                                <span className="text-fm-muted text-sm font-medium px-4">Nessuna immagine disponibile</span>
                            )}
                        </div>
                        {displayImages.length > 0 && (
                            <div className="grid grid-cols-4 gap-3 w-full">
                                {displayImages.slice(0, 4).map((imgSrc, i) => {
                                    const isActive = mainImage === imgSrc;
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => handleThumbnailClick(imgSrc)}
                                            className={`w-full aspect-square rounded-xl relative overflow-hidden bg-gray-50 flex items-center justify-center text-sm text-fm-muted cursor-pointer transition-all hover:opacity-80 border-2 ${isActive ? 'border-fm-gold opacity-100' : 'border-transparent hover:border-fm-gold'} shadow-sm`}
                                        >

                                            <Image
                                                src={imgSrc}
                                                alt={buildProductAlt(product, { context: 'gallery', imageIndex: i, municipalityName: comune })}
                                                fill
                                                className="object-cover"
                                                loading="lazy"
                                                sizes="(max-width: 768px) 25vw, 15vw"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* BLOCCO TRUST BADGES (Spostato a SX per bilanciare il layout) */}
                    <div className="space-y-3 pt-6 border-t border-gray-100 mt-8">
                        <div className="flex items-start gap-3 bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                            <span className="text-fm-cta mt-0.5 text-lg">📸</span>
                            <p className="text-[13px] text-gray-700 font-medium leading-snug">
                                <strong className="text-gray-900 block mb-0.5">Certificazione Fotografica</strong>
                                Riceverai una foto della tomba/loculo allo stato di fatto e una foto con i fiori posati sulla tomba/loculo subito dopo la consegna.
                            </p>
                        </div>
                        <div className="flex items-start gap-3 bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                            <span className="text-fm-cta mt-0.5 text-lg">🚶‍♂️</span>
                            <p className="text-[13px] text-gray-700 font-medium leading-snug">
                                <strong className="text-gray-900 block mb-0.5">Consegna e Posa in Opera</strong>
                                Costi di consegna: <span className="text-green-600 font-bold">TOTALMENTE INCLUSI</span>. Nessun costo nascosto nel carrello.
                            </p>
                        </div>
                        <p className="text-[12px] text-fm-muted/80 italic pt-2 leading-snug">
                            Le foto sono indicative: la composizione può variare leggermente per garantire sempre freschezza e qualità artigianale.
                        </p>
                    </div>
                </div>



                {/* DX: Title, Price, Optionals, Form, Button */}
                <div className="lg:w-[55%]">
                    <div className="sticky top-24 space-y-8">

                        {/* Title & Price */}
                        <div className="space-y-4 pt-10 lg:pt-0">
                            <h1 className="text-4xl lg:text-5xl font-display font-bold text-gray-900 tracking-tight leading-tight">
                                {product.name}
                            </h1>
                            <p className="text-3xl font-display font-semibold text-fm-gold tracking-tight transition-all duration-300">
                                €{totalPrice.toFixed(2)}
                            </p>
                        </div>

                        {/* CONFIGURAZIONE CONSEGNA */}
                        <div className="bg-white rounded-2xl p-6 md:p-8 shadow-xl shadow-gray-200/50 border border-gray-100 space-y-8">

                            {/* Variante Rose */}
                            {product.slug === 'bouquet-di-rose' && (
                                <div className="space-y-3 pb-2 border-b border-gray-100">
                                    <label className="block text-sm font-semibold tracking-wide text-fm-text uppercase">Colore delle rose <span className="text-fm-rose">*</span></label>
                                    <div className="flex flex-wrap gap-2">
                                        {['Rosso', 'Bianco', 'Rosa', 'Arancio', 'Giallo'].map(color => (
                                            <label key={color} className={`cursor-pointer px-4 py-2 border rounded-xl text-sm font-medium transition-all ${variantColor === color ? 'bg-fm-cta text-white border-fm-cta shadow-sm' : 'bg-gray-50 text-fm-text border-gray-200 hover:border-gray-300'}`}>
                                                <input
                                                    type="radio"
                                                    name="variantColor"
                                                    value={color}
                                                    checked={variantColor === color}
                                                    onChange={(e) => setVariantColor(e.target.value)}
                                                    className="hidden"
                                                />
                                                {color}
                                            </label>
                                        ))}
                                    </div>
                                    <div className="h-6"></div>
                                </div>
                            )}

                            <div className="space-y-6">
                                <div className="space-y-2 relative" ref={autocompleteRef}>
                                    <label className="block text-sm font-semibold text-fm-text">Verifica Copertura Cimitero <span className="text-fm-rose">*</span></label>
                                    <input
                                        type="text"
                                        placeholder="Inserisci il Comune..."
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-cta-soft focus:bg-white transition-colors"
                                        value={comune}
                                        onChange={(e) => {
                                            setComune(e.target.value);
                                            setShowSuggestions(true);
                                        }}
                                        onFocus={() => {
                                            if (comune.length >= 2) setShowSuggestions(true);
                                        }}
                                    />
                                    {comune.includes('(') && !showSuggestions && (
                                        <div className="flex items-center gap-2 mt-2 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm font-semibold border border-green-100 animate-in fade-in slide-in-from-top-1">
                                            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                            Servizio disponibile per questa località
                                        </div>
                                    )}
                                    {showSuggestions && suggestions.length > 0 && (
                                        <ul className="absolute z-20 top-[82px] left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] max-h-[220px] overflow-auto overflow-x-hidden">
                                            {suggestions.map((m, idx) => (
                                                <li
                                                    key={idx}
                                                    onClick={() => {
                                                        setComune(`${m.name} (${m.province})`);
                                                        setShowSuggestions(false);
                                                    }}
                                                    className="px-4 py-3 cursor-pointer hover:bg-gray-50 text-fm-text text-sm transition-colors border-b border-gray-100 last:border-0 flex items-center justify-between"
                                                >
                                                    <span className="font-semibold">{m.name}</span>
                                                    <span className="text-fm-muted text-xs bg-gray-100 px-2 py-0.5 rounded-md">{m.province}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {(product.slug === 'messaggio' || product.slug === 'nastro-commemorativo' || selectedAddons.includes('c3') || selectedAddons.includes('f4')) && (
                                    <div className="space-y-3 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2">
                                        <label className="block text-sm font-semibold text-fm-gold uppercase tracking-wide">
                                            Testo del Messaggio/Nastro <span className="text-fm-rose">*</span>
                                        </label>
                                        <textarea
                                            placeholder="Scrivi qui il pensiero che desideri allegare ai fiori..."
                                            className="w-full bg-white border border-fm-gold/30 rounded-xl px-4 py-4 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold shadow-sm transition-all min-h-[140px] resize-none text-lg font-medium placeholder:text-gray-300"
                                            value={customMessage}
                                            onChange={(e) => setCustomMessage(e.target.value)}
                                        ></textarea>
                                    </div>
                                )}


                            </div>

                            <div className="pt-6 border-t border-gray-100">
                                <div className="flex items-center gap-4">
                                    {/* Quantity */}
                                    <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl overflow-hidden h-14 flex-shrink-0">
                                        <button onClick={decreaseQty} className="w-12 text-fm-muted hover:text-fm-text hover:bg-gray-100 transition-colors h-full text-lg font-medium">-</button>
                                        <span className="w-8 text-center font-semibold font-display text-fm-text text-lg">{qty}</span>
                                        <button onClick={increaseQty} className="w-12 text-fm-muted hover:text-fm-text hover:bg-gray-100 transition-colors h-full text-lg font-medium">+</button>
                                    </div>

                                    <button
                                        onClick={handleAddToCart}
                                        className="hidden md:block flex-1 bg-fm-gold hover:brightness-110 text-white font-semibold font-body py-4 px-6 rounded-xl transition-all shadow-md active:scale-[0.98] h-14 text-lg"
                                    >
                                        Ordina - €{totalPrice.toFixed(2)}
                                    </button>
                                </div>
                            </div>

                            {/* WIDGET ADD-ON (CROSS-SELLING) */}
                            {availableAddons.length > 0 && (
                                <div className="pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2">
                                    <h3 className="text-lg font-display font-medium text-gray-900 mb-4">Completa il tuo omaggio</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {availableAddons.map(addon => {
                                            const isSelected = selectedAddons.includes(addon.id);
                                            return (
                                                <label 
                                                    key={addon.id} 
                                                    className={`cursor-pointer flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 ${isSelected ? 'border-fm-gold bg-yellow-50/30 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input 
                                                            type="checkbox" 
                                                            className="w-4.5 h-4.5 text-fm-gold border-gray-300 rounded focus:ring-fm-gold/50 cursor-pointer transition-colors"
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                if (e.target.checked) setSelectedAddons([...selectedAddons, addon.id]);
                                                                else setSelectedAddons(selectedAddons.filter(id => id !== addon.id));
                                                            }}
                                                        />
                                                        <span className="text-[22px] leading-none grayscale-[0.2]">{addon.icon}</span>
                                                        <span className="text-sm font-semibold text-gray-800 tracking-tight">{addon.name}</span>
                                                    </div>
                                                    <span className="text-[13px] font-bold text-fm-gold">+€{addon.price.toFixed(2)}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* BLOCCO TRUST BADGES DX */}
                        <div className="space-y-3 pt-2">
                            <div className="flex items-start gap-3 bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                                <span className="text-fm-gold mt-0.5 text-lg">🔒</span>
                                <p className="text-[13px] text-gray-700 font-medium leading-snug">
                                    <strong className="text-gray-900 block mb-0.5">Pagamento Sicuro al 100%</strong>
                                    Transazioni protette con crittografia Stripe. Accettiamo carte di credito e Apple Pay.
                                </p>
                            </div>
                            <div className="flex items-start gap-3 bg-fm-cta-soft/10 p-3 rounded-xl border border-fm-cta/20">
                                <span className="text-[#25D366] mt-0.5 text-lg">💬</span>
                                <p className="text-[13px] text-gray-700 font-medium leading-snug">
                                    <strong className="text-fm-cta block mb-0.5">Serve Aiuto?</strong>
                                    <a href="https://wa.me/393204105305" target="_blank" rel="noopener noreferrer" className="hover:text-[#25D366] font-semibold transition-colors">Dubbi sulla data o sul luogo? Scrivici, rispondiamo in tempo reale.</a>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2.5) DESCRIZIONE FULL-WIDTH (SEO & DETAILS) AL CENTRO A "T" */}
            <section className="w-full max-w-[900px] mx-auto mt-12 md:mt-16 pt-10 md:pt-12 pb-12 px-6 lg:px-12 bg-[#FAF9F6] border border-[#E2DFD3] shadow-sm rounded-[24px] relative overflow-hidden text-center">
                {/* Paper Texture Overlay */}
                <div
                    className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-multiply"
                    style={{
                        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")'
                    }}>
                </div>

                <div className="relative z-10">
                    <h2 className="text-3xl lg:text-4xl font-serif font-medium text-gray-900 mb-6 tracking-tight">
                        Dettagli della Composizione
                    </h2>

                    {/* Impact Sentence & Toggle Button */}
                    <div className="mb-6">
                        <p className="text-[17px] lg:text-[19px] text-gray-800 font-sans font-medium leading-relaxed mx-auto mb-6">
                            Un gesto di pura eleganza per onorare il ricordo, curato dai migliori fioristi della tua zona con consegna garantita.
                        </p>

                        {!isDescriptionExpanded && (
                            <button
                                onClick={() => setIsDescriptionExpanded(true)}
                                className="inline-flex items-center gap-2 text-fm-gold hover:text-yellow-600 font-semibold transition-colors duration-200"
                            >
                                Leggi ancora...
                                <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* SEO / AEO Expanded Content (Visible to bots, styled with max-height/opacity for users) */}
                    <div
                        className={`overflow-hidden transition-all duration-700 ease-in-out ${isDescriptionExpanded ? 'max-h-[2000px] opacity-100 mt-4' : 'max-h-0 opacity-0 m-0'}`}
                        aria-hidden={!isDescriptionExpanded}
                    >
                        <div className="text-[16px] lg:text-[17px] text-gray-700 font-sans leading-relaxed text-left max-w-3xl mx-auto space-y-6">
                            <h3 className="text-2xl font-serif font-medium text-gray-900 mt-4 mb-3">
                                L&apos;eccellenza dell&apos;artigianato floreale locale per {product.name}
                            </h3>

                            <p className="whitespace-pre-line">
                                {product.descriptionSEO || product.description}
                            </p>

                            <p>
                                <strong>Alta Qualità e Stagionalità:</strong> Ogni omaggio floreale viene scrupolosamente preparato partendo da fiori freschi, rigorosamente selezionati. Attraverso una rete capillare di fioristi professionisti locali, ci assicuriamo che la composizione rispetti sempre l&apos;armonia estetica scelta, adattandosi con grazia alla stagionalità.
                            </p>

                            <p>
                                <strong>Vicinanza alla tua comunità:</strong> Supportiamo le reti di artigiani di {comune || 'zona'}, abbattendo i tempi di trasporto. Questo garantisce consegne al cimitero puntuali, rispettose e in una condizione di assoluta eccellenza floreale.
                            </p>

                            <p>
                                <strong>Conferma Fotografica (Garanzia FloreMoria):</strong> Comprendiamo profondamente l&apos;importanza della memoria. Subito dopo la posa formale della composizione sulla tomba nel luogo della cerimonia funebre, il fiorista incaricato ti invierà due foto cristalline (lo stato di fatto e i fiori appena posati) direttamente su WhatsApp. Una rassicurazione immediata e trasparente che il tuo pensiero è giunto a destinazione con la dignità che merita.
                            </p>

                            {isDescriptionExpanded && (
                                <div className="text-center pt-8">
                                    <button
                                        onClick={() => setIsDescriptionExpanded(false)}
                                        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 font-medium transition-colors duration-200"
                                    >
                                        Mostra meno
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* 3) UNIFIED TRUST & HOW IT WORKS SECTION (Desktop + Mobile) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 pt-6 lg:pt-8 w-full max-w-5xl mx-auto">
                {/* Come Funziona */}
                <section className="bg-white rounded-2xl p-6 md:p-8 border border-gray-100 shadow-sm flex flex-col h-full">
                    <h3 className="text-xl font-display font-semibold text-fm-text mb-8 text-center lg:text-left">
                        Come funziona dopo l&apos;ordine
                    </h3>
                    <div className="space-y-6 relative flex-grow">
                        {/* Vertical line connecting steps */}
                        <div className="absolute top-6 bottom-6 left-6 w-[2px] bg-fm-rose-soft/50 z-0"></div>

                        <div className="flex items-center text-left relative z-10 gap-5">
                            <div className="w-12 h-12 flex-shrink-0 rounded-full bg-fm-cta-soft flex items-center justify-center text-fm-cta font-display font-bold text-xl shadow-sm border border-white">1</div>
                            <div>
                                <h4 className="font-semibold text-fm-text">Preparazione</h4>
                                <p className="text-sm text-fm-muted">Un fiorista locale prepara i tuoi fiori freschi.</p>
                            </div>
                        </div>
                        <div className="flex items-center text-left relative z-10 gap-5">
                            <div className="w-12 h-12 flex-shrink-0 rounded-full bg-fm-rose-soft flex items-center justify-center text-fm-rose font-display font-bold text-xl shadow-sm border border-white">2</div>
                            <div>
                                <h4 className="font-semibold text-fm-text">Consegna al Cimitero</h4>
                                <p className="text-sm text-fm-muted">Posizionamento con cura e rispetto sulla tomba.</p>
                            </div>
                        </div>
                        <div className="flex items-center text-left relative z-10 gap-5">
                            <div className="w-12 h-12 flex-shrink-0 rounded-full bg-fm-section flex items-center justify-center text-fm-text font-display font-bold text-xl shadow-sm border border-white">3</div>
                            <div>
                                <h4 className="font-semibold text-fm-text">Foto su WhatsApp</h4>
                                <p className="text-sm text-fm-muted">Riceverai subito le due foto di conferma (prima e dopo).</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Box Rassicurazione */}
                <section className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 md:p-8 border border-fm-rose-soft shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col h-full">
                    <h3 className="text-xl font-display font-semibold text-fm-text mb-8 text-center lg:text-left">
                        Perché scegliere FloreMoria
                    </h3>
                    <ul className="space-y-6 font-body text-fm-text text-left flex-grow text-[15px] md:text-[16px]">
                        <li className="flex items-start gap-4">
                            <span className="flex-shrink-0 w-10 h-10 rounded-full bg-fm-cta-soft flex items-center justify-center text-fm-cta mt-1">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </span>
                            <span className="font-medium leading-relaxed">Consegna garantita a cura di un professionista fiorista locale</span>
                        </li>
                        <li className="flex items-start gap-4">
                            <span className="flex-shrink-0 w-10 h-10 rounded-full bg-fm-cta-soft flex items-center justify-center text-fm-cta mt-1">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </span>
                            <span className="font-medium leading-relaxed">Invio discreto delle due foto via WhatsApp post-consegna</span>
                        </li>
                        <li className="flex items-start gap-4">
                            <span className="flex-shrink-0 w-10 h-10 rounded-full bg-fm-cta-soft flex items-center justify-center text-fm-cta mt-1">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </span>
                            <span className="font-medium leading-relaxed">Assistenza clienti tempestiva in Italia dedicata via chat, telefono o mail</span>
                        </li>
                    </ul>
                </section>
            </div>

            {/* CORE VALUES */}
            <div className="pt-12">
                <CoreValues />
            </div>

            {/* 4) PRODOTTI CORRELATI (Spesso i nostri utenti acquistano) */}
            <section className="pt-12 border-t border-gray-100">
                <h2 className="text-[28px] lg:text-[32px] font-display font-semibold text-fm-text leading-snug mb-8 text-center md:text-left">
                    Spesso i nostri utenti acquistano anche:
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {relatedProducts.map(p => (
                        <ProductCard key={p.id} product={p} />
                    ))}
                </div>
            </section>

            {/* MOBILE STICKY BOTTOM CTA */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-8px_16px_rgba(0,0,0,0.08)] z-[100] pb-safe">
                <button
                    onClick={handleAddToCart}
                    className="w-full bg-fm-gold hover:brightness-110 text-white font-semibold font-body py-4 rounded-xl transition-all shadow-md active:scale-[0.98] h-[56px] text-lg flex justify-center items-center gap-3"
                >
                    <span>Ordina</span>
                    <span className="opacity-80 translate-y-[-1px]">|</span>
                    <span className="font-bold">€{totalPrice.toFixed(2)}</span>
                </button>
            </div>
            {/* Safe area padding for mobile spacing */}
            <div className="h-[80px] md:hidden"></div>
        </div>
    );
}
