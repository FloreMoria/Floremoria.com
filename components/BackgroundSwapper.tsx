'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';

export default function BackgroundSwapper() {
    const [activeHero, setActiveHero] = useState<1 | 2>(1);

    useEffect(() => {
        const handleScroll = () => {
            const reviewsEl = document.getElementById('reviews');
            if (reviewsEl) {
                const rect = reviewsEl.getBoundingClientRect();
                if (rect.top <= 20) {
                    setActiveHero(2);
                } else {
                    setActiveHero(1);
                }
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <>
            {/* HERO 1 */}
            <div className={`fixed top-0 left-0 right-0 h-[75vh] lg:h-[85vh] z-0 transition-opacity duration-700 pointer-events-none ${activeHero === 1 ? 'opacity-100' : 'opacity-0'}`}>
                <Image
                    src="/images/hero/consegna-fiori-cimitero-home-floremoria.webp"
                    alt="Consegna fiori cimitero FloreMoria"
                    fill
                    className="object-cover object-top brightness-[1.05] saturate-[1.1]"
                    priority
                />
                {/* Nessuna ombra dura, solo luce. */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/5"></div>
            </div>

            {/* HERO 2 */}
            <div className={`fixed top-0 left-0 right-0 h-[75vh] lg:h-[85vh] z-0 transition-opacity duration-700 pointer-events-none ${activeHero === 2 ? 'opacity-100' : 'opacity-0'}`}>
                <Image
                    src="/images/hero/fiori-sulle-tombe-servizio-home-italia.webp"
                    alt="Servizio Fiori in tutta Italia"
                    fill
                    className="object-cover object-top brightness-[1.05] saturate-[1.1]"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/5"></div>
            </div>
        </>
    );
}
