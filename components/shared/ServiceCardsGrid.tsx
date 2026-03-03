import React from 'react';
import Button from '@/components/Button';

export interface ServiceCardData {
    title: string;
    benefit: string;
    link: string;
    ctaText?: string;
}

interface ServiceCardsGridProps {
    title?: string;
    cards: ServiceCardData[];
}

export default function ServiceCardsGrid({ title = "Cosa puoi ordinare", cards }: ServiceCardsGridProps) {
    return (
        <section id="scelta" className="bg-white rounded-[30px] p-8 lg:p-16 shadow-xl border border-gray-100">
            {title && (
                <div className="text-center mb-10 border-b border-fm-rose-soft/30 pb-6">
                    <h2 className="text-[32px] font-display font-semibold text-fm-text leading-snug">
                        {title}
                    </h2>
                </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {cards.map((card, idx) => (
                    <div key={idx} className="bg-white rounded-[20px] p-6 shadow-sm border border-fm-rose-soft/30 hover:shadow-md transition-all flex flex-col h-full relative group">
                        <div className="flex-grow">
                            <h3 className="text-xl font-display font-semibold text-fm-text mb-2 tracking-tight">
                                {card.title}
                            </h3>
                            <p className="text-fm-muted text-[15px] font-body leading-relaxed mb-4">
                                {card.benefit}
                            </p>
                        </div>
                        <div className="mt-6 pt-6 border-t border-fm-rose-soft/30 flex flex-col">
                            <Button href={card.link} variant="secondary">
                                {card.ctaText || "Dettagli"}
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
