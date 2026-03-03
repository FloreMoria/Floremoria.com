import React from 'react';

interface TrustGridProps {
    title?: string;
    bullets: string[];
}

export default function TrustGrid({ title = "Perché scegliere FloreMoria", bullets }: TrustGridProps) {
    return (
        <section className="bg-fm-section rounded-[30px] p-8 lg:p-16 border border-fm-rose-soft/30 shadow-sm text-center">
            {title && (
                <h2 className="text-2xl md:text-3xl font-display font-semibold text-fm-text mb-8">
                    {title}
                </h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {bullets.map((bullet, idx) => (
                    <div key={idx} className="flex flex-col items-center space-y-4 bg-white/60 p-6 lg:p-8 rounded-2xl border border-white shadow-[0_4px_15px_rgba(0,0,0,0.02)] hover:shadow-md transition-shadow">
                        <span className="w-12 h-12 rounded-full bg-fm-cta-soft flex items-center justify-center text-fm-cta">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        </span>
                        <p className="font-semibold text-fm-text text-[15px] leading-snug">{bullet}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}
