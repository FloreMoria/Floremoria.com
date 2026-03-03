import React from 'react';
import Link from 'next/link';

interface PageHeroProps {
    headline: string;
    subheadline: string;
    ctaText: string;
    ctaLink: string;
    trustLine: string;
}

export default function PageHero({ headline, subheadline, ctaText, ctaLink, trustLine }: PageHeroProps) {
    return (
        <section className="bg-white rounded-[30px] lg:rounded-[50px] p-8 lg:p-16 text-center shadow-xl border border-gray-100">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-fm-text leading-tight tracking-tight mb-6">
                {headline}
            </h1>
            <p className="text-lg md:text-xl text-fm-muted font-body leading-relaxed max-w-2xl mx-auto mb-10">
                {subheadline}
            </p>
            <div className="flex flex-col items-center gap-4">
                <Link href={ctaLink} className="inline-block bg-fm-cta hover:bg-fm-cta-hover text-white font-semibold font-body py-4 px-8 rounded-xl transition-all shadow-md active:scale-[0.98] text-lg">
                    {ctaText}
                </Link>
                <p className="text-sm font-medium text-fm-text/60 mt-2">
                    {trustLine}
                </p>
            </div>
        </section>
    );
}
