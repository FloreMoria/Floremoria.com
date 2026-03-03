'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Product, products } from '@/lib/products';
import ProductCard from '@/components/ProductCard';
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
    const autocompleteRef = useRef<HTMLDivElement>(null);

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

    const [nome, setNome] = useState('');
    const [cognome, setCognome] = useState('');
    const [dataNascita, setDataNascita] = useState('');
    const [dataMorte, setDataMorte] = useState('');
    const [dataConsegna, setDataConsegna] = useState('');
    const [note, setNote] = useState('');
    const [customMessage, setCustomMessage] = useState('');
    const [variantColor, setVariantColor] = useState('Rosso');

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
                if (parsed.nome) setNome(parsed.nome);
                if (parsed.cognome) setCognome(parsed.cognome);
                if (parsed.dataNascita) setDataNascita(parsed.dataNascita);
                if (parsed.dataMorte) setDataMorte(parsed.dataMorte);
                if (parsed.dataConsegna) setDataConsegna(parsed.dataConsegna);
                if (parsed.note) setNote(parsed.note);
                if (parsed.customMessage) setCustomMessage(parsed.customMessage);
            }
        } catch (e) {
            console.error('Error parsing fm_checkout_data:', e);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const dataToSave = { comune, nome, cognome, dataNascita, dataMorte, dataConsegna, note, customMessage };
        localStorage.setItem('fm_checkout_data', JSON.stringify(dataToSave));
    }, [comune, nome, cognome, dataNascita, dataMorte, dataConsegna, note, customMessage]);

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
            setMainImage(galleryImages[0]);
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

    // Calculate min date (today + 2 days)
    const today = new Date();
    today.setDate(today.getDate() + 2);
    const minDateISO = today.toISOString().split('T')[0];

    const handleAddToCart = () => {
        if (dataConsegna && dataConsegna < minDateISO) {
            alert("La consegna può essere programmata a partire da due giorni da oggi");
            return;
        }

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
                    comune, nome, cognome, dataNascita, dataMorte, dataConsegna, note,
                    ...(product.slug === 'bouquet-di-rose' ? { variantColor } : {}),
                    ...(product.slug === 'messaggio' || product.slug === 'nastro-commemorativo' ? { customMessage } : {})
                }
            };
            cart.push(newItem);
        }

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
                                    {(() => { console.log("Tentativo caricamento immagine MAIN per:", product.slug, "Path:", mainImage); return null; })()}
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
                                            {(() => { console.log("Tentativo caricamento immagine THUMBNAIL per:", product.slug, "Path:", imgSrc); return null; })()}
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

                    {/* BLOCCO COPY SEO */}
                    <div>
                        <h2 className="text-2xl font-display font-semibold text-fm-text mb-4">
                            Descrizione dell&apos;omaggio floreale
                        </h2>
                        <div className="text-[17px] text-fm-text opacity-80 font-body leading-relaxed whitespace-pre-line bg-gray-50/50 p-6 md:p-8 rounded-[20px] border border-gray-100 shadow-sm">
                            {product.descriptionSEO || product.description}
                        </div>
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
                            <p className="text-3xl font-display font-semibold text-fm-gold tracking-tight">
                                €{product.price.toFixed(2)}
                            </p>
                            <p className="text-[14px] text-fm-muted font-medium pt-0">
                                Prezzo tutto incluso. {product.isBouquet ? 'Consegna gratuita, nessun' : 'Nessun'} costo nascosto.
                            </p>
                            <p className="text-lg text-fm-muted font-body leading-relaxed pt-2">
                                {product.description}
                            </p>
                            <p className="text-[13px] text-fm-muted/80 italic pt-1 leading-snug">
                                Le foto sono indicative: la composizione può variare leggermente per garantire sempre freschezza e qualità.
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
                                    <label className="block text-sm font-semibold text-fm-text">Comune o Cimitero <span className="text-fm-rose">*</span></label>
                                    <input
                                        type="text"
                                        placeholder="Es. Cimitero Monumentale, Milano"
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
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="block text-sm font-semibold text-fm-text">Nome defunto <span className="text-fm-rose">*</span></label>
                                        <input
                                            type="text"
                                            placeholder="Mario"
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-cta-soft focus:bg-white transition-colors"
                                            value={nome}
                                            onChange={(e) => setNome(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-semibold text-fm-text">Cognome defunto <span className="text-fm-rose">*</span></label>
                                        <input
                                            type="text"
                                            placeholder="Rossi"
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-cta-soft focus:bg-white transition-colors"
                                            value={cognome}
                                            onChange={(e) => setCognome(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Campi opzionali Date */}
                                <div className="pt-2">
                                    <details className="group">
                                        <summary className="cursor-pointer text-sm font-medium text-fm-cta hover:text-fm-cta-hover transition-colors list-none inline-flex items-center gap-1 select-none">
                                            <span>+ Aggiungi dati per omonimia</span>
                                            <span className="text-fm-muted font-normal">(opzionale)</span>
                                        </summary>
                                        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
                                            <div className="space-y-2">
                                                <label className="block text-sm font-medium text-fm-muted">Data nascita</label>
                                                <input
                                                    type="date"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-cta-soft focus:bg-white transition-colors"
                                                    value={dataNascita}
                                                    onChange={(e) => setDataNascita(e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="block text-sm font-medium text-fm-muted">Data morte</label>
                                                <input
                                                    type="date"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-cta-soft focus:bg-white transition-colors"
                                                    value={dataMorte}
                                                    onChange={(e) => setDataMorte(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </details>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-gray-100">
                                    <label className="block text-sm font-semibold text-fm-text mt-4">Data di consegna preferita <span className="text-fm-rose">*</span></label>
                                    <input
                                        type="date"
                                        min={minDateISO}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-cta-soft focus:bg-white transition-colors"
                                        value={dataConsegna}
                                        onChange={(e) => setDataConsegna(e.target.value)}
                                    />
                                    <p className="text-[13px] text-fm-muted font-medium pt-1">
                                        La consegna gratuita è disponibile da 2 giorni da oggi.
                                    </p>
                                    <p className="text-[12px] text-fm-muted/80 italic pt-1 leading-snug">
                                        Se il fiorista o il cimitero sono chiusi, la consegna viene effettuata il primo giorno disponibile.
                                    </p>
                                </div>

                                {(product.slug === 'messaggio' || product.slug === 'nastro-commemorativo') && (
                                    <div className="space-y-3 pt-4 border-t border-gray-100">
                                        <label className="block text-sm font-semibold text-fm-gold uppercase tracking-wide">
                                            Testo del {product.slug === 'messaggio' ? 'Messaggio' : 'Nastro'} <span className="text-fm-rose">*</span>
                                        </label>
                                        <textarea
                                            placeholder={product.slug === 'messaggio' ? "Scrivi qui il pensiero che desideri allegare ai fiori..." : "Scrivi qui la frase per il nastro (es. 'Dai tuoi nipoti', 'Alla cara zia')"}
                                            className="w-full bg-white border border-fm-gold/30 rounded-xl px-4 py-4 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold shadow-sm transition-all min-h-[140px] resize-none text-lg font-medium placeholder:text-gray-300"
                                            value={customMessage}
                                            onChange={(e) => setCustomMessage(e.target.value)}
                                        ></textarea>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-fm-text">Note aggiuntive <span className="text-fm-muted font-normal text-xs">(Opzionale)</span></label>
                                    <textarea
                                        placeholder="Se conosci la posizione esatta della tomba (es. Campo V, Fila 10, N° 4) scrivilo qui..."
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-cta-soft focus:bg-white transition-colors min-h-[90px] resize-none"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                    ></textarea>
                                </div>
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
                                        Ordina
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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
                                <p className="text-sm text-fm-muted">Riceverai subito una foto di conferma della consegna.</p>
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
                            <span className="font-medium leading-relaxed">Invio discreto di documentazione fotografica via WhatsApp post-consegna</span>
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
                    <span className="font-bold">€{(product.price * qty).toFixed(2)}</span>
                </button>
            </div>
            {/* Safe area padding for mobile spacing */}
            <div className="h-[80px] md:hidden"></div>
        </div>
    );
}
