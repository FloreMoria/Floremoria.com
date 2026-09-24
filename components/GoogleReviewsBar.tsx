'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState } from 'react';

interface Review {
    author_name: string;
    profile_photo_url: string;
    rating: number;
    text: string;
    time: number;
}

const DEFAULT_GOOGLE_URL =
    'https://www.google.com/maps/place/?q=place_id:ChIJeUohbcWdhkcRi0cg4AHrlM4';

type StatsState = {
    ok: boolean;
    rating: number | null;
    user_ratings_total: number | null;
    url: string;
    reviews: Review[];
};

/**
 * Recensioni homepage: solo dati Google Places (autentici).
 * Niente placeholder, niente località inventate. Se Google non risponde → solo link.
 */
export default function GoogleReviewsBar() {
    const [stats, setStats] = useState<StatsState>({
        ok: false,
        rating: null,
        user_ratings_total: null,
        url: DEFAULT_GOOGLE_URL,
        reviews: [],
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const fetchReviews = async () => {
            try {
                const res = await fetch('/api/google-reviews');
                const data = await res.json();
                if (!mounted) return;

                const url =
                    typeof data.url === 'string' && data.url.trim()
                        ? data.url.trim()
                        : DEFAULT_GOOGLE_URL;

                if (
                    data.ok === true &&
                    typeof data.rating === 'number' &&
                    typeof data.user_ratings_total === 'number'
                ) {
                    setStats({
                        ok: true,
                        rating: data.rating,
                        user_ratings_total: data.user_ratings_total,
                        url,
                        reviews: Array.isArray(data.reviews) ? data.reviews : [],
                    });
                } else {
                    // Fallback onesto: solo link Google, nessun numero/testo inventato
                    setStats({
                        ok: false,
                        rating: null,
                        user_ratings_total: null,
                        url,
                        reviews: [],
                    });
                }
            } catch (error) {
                console.error('Failed to fetch google reviews stats', error);
                if (mounted) {
                    setStats({
                        ok: false,
                        rating: null,
                        user_ratings_total: null,
                        url: DEFAULT_GOOGLE_URL,
                        reviews: [],
                    });
                }
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        fetchReviews();
        return () => {
            mounted = false;
        };
    }, []);

    /*
     * --- NASCOSTO (non cancellato) — NON USARE in UI ---
     * Placeholder inventati + località fake usati prima del 2026-09-24.
     * Conservati solo come archivio; la UI non li richiama più.
     *
    function getPlaceholderReviews(): Review[] {
        return [
            {
                author_name: "Mario",
                profile_photo_url: "",
                rating: 5,
                text: "Servizio eccellente e rispettoso. Poter vedere le foto della tomba, prima e dopo la consegna, mi ha scaldato il cuore e dato tanta serenità.",
                time: Math.floor(Date.now() / 1000) - 86400 * 2
            },
            {
                author_name: "Silvia",
                profile_photo_url: "",
                rating: 5,
                text: "Vivo in Germania da anni. Affidarmi a voi mi permette di essere presente per i miei cari. Fiori freschissimi e massima cura nei dettagli della posa.",
                time: Math.floor(Date.now() / 1000) - 86400 * 5
            },
            {
                author_name: "Elena",
                profile_photo_url: "",
                rating: 5,
                text: "Ricevere la conferma fotografica su WhatsApp è davvero rassicurante e colma un bisogno reale per chi vive lontano. Grazie di cuore a tutto il team.",
                time: Math.floor(Date.now() / 1000) - 86400 * 8
            },
            {
                author_name: "Giovanni",
                profile_photo_url: "",
                rating: 5,
                text: "Consegna puntuale e fiori esattamente come da foto. Servizio prezioso per chi non può recarsi con frequenza al cimitero.",
                time: Math.floor(Date.now() / 1000) - 86400 * 12
            },
            {
                author_name: "Roberto",
                profile_photo_url: "",
                rating: 5,
                text: "Grande sensibilità e puntualità. Hanno individuato la tomba di famiglia con precisione e posato l'omaggio con immenso rispetto.",
                time: Math.floor(Date.now() / 1000) - 86400 * 16
            },
            {
                author_name: "Maria",
                profile_photo_url: "",
                rating: 5,
                text: "Composizione per funerale bellissima e arrivata in chiesa con largo anticipo. La foto ricevuta prima della funzione è stata un grande sollievo.",
                time: Math.floor(Date.now() / 1000) - 86400 * 22
            }
        ];
    }
    // Località inventata (non usare):
    // location: `Presso il Cimitero di ${displayMunicipalities[i].name} (${displayMunicipalities[i].province})`
    // da /api/municipalities/random
     * --- fine archivio nascosto ---
     */

    const reviewsToDisplay = stats.ok ? stats.reviews.slice(0, 5) : [];
    const marqueeReviews =
        reviewsToDisplay.length > 0 ? [...reviewsToDisplay, ...reviewsToDisplay] : [];
    const hasCounter =
        stats.ok && stats.rating !== null && stats.user_ratings_total !== null;
    const displayRating = hasCounter ? stats.rating!.toFixed(1) : null;

    return (
        <section className="w-full relative py-10 sm:py-16 md:py-20 px-4 overflow-hidden bg-fm-section/30">
            <style jsx>{`
                @keyframes marquee {
                    0% {
                        transform: translateX(0);
                    }
                    100% {
                        transform: translateX(-50%);
                    }
                }
                .animate-marquee {
                    display: flex;
                    width: max-content;
                    animation: marquee 50s linear infinite;
                }
                .animate-marquee:hover {
                    animation-play-state: paused;
                }
            `}</style>

            <div className="max-w-6xl mx-auto space-y-7 sm:space-y-12 md:space-y-16">
                <div className="text-center space-y-2 sm:space-y-4">
                    <h2 className="text-[24px] sm:text-[30px] md:text-4xl font-display font-semibold text-fm-text leading-tight drop-shadow-sm">
                        La voce di chi ci ha scelto
                    </h2>
                    <p className="text-fm-muted font-body text-[15px] sm:text-lg max-w-2xl mx-auto">
                        Cosa dicono di noi le persone che ci hanno scelto per ricordare i propri cari.
                    </p>
                </div>

                {/* Contatore stelle cliccabile → Google (solo se dati autentici) */}
                {!isLoading && hasCounter && (
                    <div className="text-center">
                        <a
                            href={stats.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex flex-col sm:flex-row items-center gap-2 sm:gap-3 rounded-2xl border border-white/30 bg-white/40 backdrop-blur-md px-6 py-4 hover:bg-white/70 transition-colors shadow-sm"
                            aria-label={`Vedi le ${stats.user_ratings_total} recensioni FloreMoria su Google, media ${displayRating} su 5`}
                        >
                            <div className="flex items-center gap-1 text-yellow-500" aria-hidden>
                                {[...Array(5)].map((_, i) => (
                                    <svg
                                        key={i}
                                        className={`w-6 h-6 fill-current ${
                                            i < Math.round(stats.rating!) ? 'opacity-100' : 'opacity-30'
                                        }`}
                                        viewBox="0 0 24 24"
                                    >
                                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                    </svg>
                                ))}
                            </div>
                            <span className="font-display font-bold text-fm-text text-xl">
                                {displayRating}
                                <span className="text-fm-muted font-body font-medium text-base"> / 5</span>
                            </span>
                            <span className="text-fm-muted font-body text-sm sm:text-base">
                                · {stats.user_ratings_total} recensioni su Google
                            </span>
                            <svg className="w-5 h-5 ml-1" viewBox="0 0 24 24" aria-hidden>
                                <path
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    fill="#EA4335"
                                />
                            </svg>
                        </a>
                    </div>
                )}

                {marqueeReviews.length > 0 && (
                    <div
                        className={`relative w-full overflow-hidden transition-opacity duration-700 ${
                            isLoading ? 'opacity-0' : 'opacity-100'
                        }`}
                    >
                        <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-fm-section/30 to-transparent z-10 pointer-events-none"></div>
                        <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-fm-section/30 to-transparent z-10 pointer-events-none"></div>

                        <div className="animate-marquee gap-4 sm:gap-6 py-2 sm:py-4">
                            {marqueeReviews.map((review, idx) => (
                                <blockquote
                                    key={`${review.author_name}-${review.time}-${idx}`}
                                    className="w-[285px] sm:w-[320px] md:w-[400px] flex-shrink-0 flex flex-col justify-between h-full bg-white/10 backdrop-blur-md border border-white/20 p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:bg-white/40 transition-all duration-300"
                                >
                                    <div className="space-y-3 sm:space-y-5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1 text-yellow-500">
                                                {[...Array(5)].map((_, i) => (
                                                    <svg
                                                        key={i}
                                                        className={`w-4 h-4 sm:w-5 sm:h-5 fill-current ${
                                                            i < review.rating ? 'opacity-100' : 'opacity-30'
                                                        }`}
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                                    </svg>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-2 opacity-70">
                                                {review.profile_photo_url ? (
                                                    <img
                                                        src={review.profile_photo_url}
                                                        alt=""
                                                        className="w-6 h-6 rounded-full shadow-sm object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full bg-fm-rose-soft flex items-center justify-center font-display font-bold text-[10px] text-fm-text shadow-sm">
                                                        {review.author_name.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                    <path
                                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                                        fill="#4285F4"
                                                    />
                                                    <path
                                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                                        fill="#34A853"
                                                    />
                                                    <path
                                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                                        fill="#FBBC05"
                                                    />
                                                    <path
                                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                                        fill="#EA4335"
                                                    />
                                                </svg>
                                            </div>
                                        </div>
                                        <p className="text-fm-text font-body text-[14px] sm:text-[16px] italic leading-relaxed line-clamp-4 sm:line-clamp-5">
                                            &quot;{review.text}&quot;
                                        </p>
                                    </div>

                                    <footer className="mt-5 sm:mt-8 pt-4 sm:pt-6 border-t border-fm-muted/20">
                                        <cite className="flex flex-col not-italic">
                                            <span className="font-display font-bold text-fm-text text-base sm:text-lg">
                                                {review.author_name}
                                            </span>
                                            <span className="text-[13px] font-medium text-fm-muted mt-1">
                                                Recensione Google
                                            </span>
                                        </cite>
                                    </footer>
                                </blockquote>
                            ))}
                        </div>
                    </div>
                )}

                {/* Link Google: sempre presente; con contatore se ok */}
                <div className="text-center pt-4 sm:pt-8 relative z-20">
                    <a
                        href={stats.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-8 py-3.5 rounded-full font-body font-semibold transition-all duration-300 shadow-sm bg-white hover:bg-gray-50 border border-gray-200 text-fm-text"
                    >
                        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                fill="#4285F4"
                            />
                            <path
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                fill="#34A853"
                            />
                            <path
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                fill="#FBBC05"
                            />
                            <path
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                fill="#EA4335"
                            />
                        </svg>
                        {hasCounter
                            ? `Leggi su Google (${displayRating}/5 · ${stats.user_ratings_total} recensioni)`
                            : 'Leggi le recensioni su Google'}
                    </a>
                </div>
            </div>
        </section>
    );
}
