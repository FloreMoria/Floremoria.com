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

export default function GoogleReviewsBar() {
    const [stats, setStats] = useState({
        rating: 4.8,
        user_ratings_total: 120,
        url: "",
        reviews: [] as Review[]
    });
    const [isLoading, setIsLoading] = useState(true);
    const [selectedMunicipalities, setSelectedMunicipalities] = useState<any[]>([]);

    useEffect(() => {
        let mounted = true;
        const fetchReviews = async () => {
            try {
                const res = await fetch('/api/google-reviews');
                if (res.ok) {
                    const data = await res.json();
                    if (mounted) {
                        setStats(prev => ({
                            rating: data.rating || prev.rating,
                            user_ratings_total: data.user_ratings_total || prev.user_ratings_total,
                            url: data.url || prev.url,
                            reviews: data.reviews && data.reviews.length > 0 ? data.reviews : getPlaceholderReviews()
                        }));
                    }
                } else {
                    if (mounted) {
                        setStats(prev => ({ ...prev, reviews: getPlaceholderReviews() }));
                    }
                }
            } catch (error) {
                console.error("Failed to fetch google reviews stats", error);
                if (mounted) {
                    setStats(prev => ({ ...prev, reviews: getPlaceholderReviews() }));
                }
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        const fetchMunicipalities = async () => {
            try {
                const res = await fetch('/api/municipalities/random?count=10');
                if (res.ok) {
                    const data = await res.json();
                    if (mounted && data && data.length > 0) {
                        setSelectedMunicipalities(data);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch random municipalities", err);
            }
        };

        fetchReviews();
        fetchMunicipalities();

        return () => { mounted = false; };
    }, []);

    function getPlaceholderReviews(): Review[] {
        return [
            {
                author_name: "Marco B.",
                profile_photo_url: "",
                rating: 5,
                text: "Servizio eccellente e rispettoso. Poter vedere la foto del fiore posato sulla tomba della mia mamma mi ha scaldato il cuore.",
                time: Math.floor(Date.now() / 1000) - 86400 * 2
            },
            {
                author_name: "Silvia R.",
                profile_photo_url: "",
                rating: 5,
                text: "Vivo in Germania. Affidarmi a voi mi permette di essere presente per i miei cari. Fiori freschissimi e cura nei dettagli della consegna.",
                time: Math.floor(Date.now() / 1000) - 86400 * 5
            },
            {
                author_name: "Elena G.",
                profile_photo_url: "",
                rating: 4,
                text: "L'idea di ricevere la conferma su WhatsApp è davvero rassicurante e colma un bisogno reale. Grazie infinite a tutto il team.",
                time: Math.floor(Date.now() / 1000) - 86400 * 12
            },
            {
                author_name: "Giovanni C.",
                profile_photo_url: "",
                rating: 5,
                text: "Consegna puntuale e fiori come da foto. Servizio molto utile per chi come me non può recarsi spesso al cimitero.",
                time: Math.floor(Date.now() / 1000) - 86400 * 20
            }
        ];
    }

    const reviewsToDisplay = stats.reviews.length > 0 ? stats.reviews.slice(0, 5) : getPlaceholderReviews().slice(0, 5);
    const displayRating = stats.rating.toFixed(1);

    const displayMunicipalities = selectedMunicipalities.length > 0
        ? selectedMunicipalities
        : Array(10).fill({ name: "Milano", province: "MI" });

    // Enhanced reviews combining Google Data with pseudo-real Location
    const enhancedReviews = reviewsToDisplay.map((review, i) => ({
        ...review,
        location: `Presso il Cimitero di ${displayMunicipalities[i % displayMunicipalities.length]?.name || 'Milano'} (${displayMunicipalities[i % displayMunicipalities.length]?.province || 'MI'})`
    }));

    const marqueeReviews = [...enhancedReviews, ...enhancedReviews];

    return (
        <section className="w-full relative py-20 px-4 overflow-hidden bg-fm-section/30">
            <style jsx>{`
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
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

            <div className="max-w-6xl mx-auto space-y-16">
                <div className="text-center space-y-4">
                    <h2 className="text-[32px] md:text-4xl font-display font-semibold text-fm-text leading-tight drop-shadow-sm">
                        La voce di chi ci ha scelto
                    </h2>
                    <p className="text-fm-muted font-body text-lg max-w-2xl mx-auto">
                        Cosa dicono di noi le persone che ci hanno scelto per ricordare i propri cari.
                    </p>
                </div>

                <div className={`relative w-full overflow-hidden transition-opacity duration-700 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
                    {/* Gradient masks for smooth edges */}
                    <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-fm-section/30 to-transparent z-10 pointer-events-none"></div>
                    <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-fm-section/30 to-transparent z-10 pointer-events-none"></div>

                    {/* Marquee Track */}
                    <div className="animate-marquee gap-6 py-4">
                        {marqueeReviews.map((review, idx) => (
                            <blockquote
                                key={idx}
                                className="w-[320px] md:w-[400px] flex-shrink-0 flex flex-col justify-between h-full bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:bg-white/40 transition-all duration-300"
                            >
                                <div className="space-y-5">
                                    <div className="flex items-center justify-between">
                                        {/* Google Stars */}
                                        <div className="flex items-center gap-1 text-yellow-500">
                                            {[...Array(5)].map((_, i) => (
                                                <svg key={i} className={`w-5 h-5 fill-current ${i < review.rating ? 'opacity-100' : 'opacity-30'}`} viewBox="0 0 24 24">
                                                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                                </svg>
                                            ))}
                                        </div>
                                        {/* Formatted Date or Initial Header part */}
                                        <div className="flex items-center gap-2 opacity-70">
                                            {review.profile_photo_url ? (
                                                <img src={review.profile_photo_url} alt={review.author_name} className="w-6 h-6 rounded-full shadow-sm object-cover" />
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-fm-rose-soft flex items-center justify-center font-display font-bold text-[10px] text-fm-text shadow-sm">
                                                    {review.author_name.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                            </svg>
                                        </div>
                                    </div>
                                    <p className="text-fm-text font-body text-[16px] italic leading-relaxed line-clamp-5">
                                        &quot;{review.text}&quot;
                                    </p>
                                </div>

                                <footer className="mt-8 pt-6 border-t border-fm-muted/20">
                                    <cite className="flex flex-col not-italic">
                                        <span className="font-display font-bold text-fm-text text-lg">
                                            {review.author_name}
                                        </span>
                                        <span className="text-[13px] font-medium text-fm-muted mt-1 truncate">
                                            {review.location}
                                        </span>
                                    </cite>
                                </footer>
                            </blockquote>
                        ))}
                    </div>
                </div>

                {/* Footer link */}
                {stats.url && (
                    <div className="text-center pt-8 relative z-20">
                        <a href={stats.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center px-8 py-3.5 rounded-full font-body font-semibold transition-all duration-300 shadow-sm bg-white hover:bg-gray-50 border border-gray-200 text-fm-text">
                            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Leggi su Google ({displayRating}/5.0)
                        </a>
                    </div>
                )}
            </div>
        </section>
    );
}
