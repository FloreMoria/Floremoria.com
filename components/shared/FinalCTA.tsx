import React from 'react';
import Link from 'next/link';

interface FinalCTAProps {
    title: string;
    helperText: string;
    ctaText: string;
    ctaLink: string;
}

export default function FinalCTA({ title, helperText, ctaText, ctaLink }: FinalCTAProps) {
    return (
        <section className="text-center p-8 lg:p-16 w-full mx-auto space-y-6 bg-white rounded-[30px] shadow-xl border border-gray-100 flex flex-col justify-center items-center">
            <h2 className="text-[32px] md:text-4xl font-display font-bold text-fm-text leading-tight max-w-2xl">
                {title}
            </h2>
            <p className="text-lg text-fm-muted font-body mb-8 max-w-xl">
                {helperText}
            </p>
            <Link href={ctaLink} className="inline-block bg-fm-cta hover:bg-fm-cta-hover text-white font-semibold font-body py-4 px-8 rounded-xl transition-all shadow-md active:scale-[0.98] text-lg mt-4">
                {ctaText}
            </Link>
        </section>
    );
}
