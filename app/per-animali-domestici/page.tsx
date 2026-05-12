import { Metadata } from 'next';
import React from 'react';
import ProductGrid from '@/components/shared/ProductGrid';
import {
    CATALOG_SLUGS_ANIMALI_ACCESSORIES,
    CATALOG_SLUGS_ANIMALI_MAIN,
    productsBySlugOrder,
} from '@/lib/catalogProductOrder';

export const metadata: Metadata = {
    title: 'Una Vita che continua a germogliare - Fiori per i Piccoli Amici | FloreMoria',
    description: 'Il ricordo vivente dei nostri piccoli amici. Piante per addio basate sul trasferimento vitale.',
    keywords: 'trasferimento vitale piccoli amici, ricordo vivente, piante per addio',
};

export default function PerAnimaliDomesticiPage() {
    const animalProducts = productsBySlugOrder(CATALOG_SLUGS_ANIMALI_MAIN);
    const accessoriesProducts = productsBySlugOrder(CATALOG_SLUGS_ANIMALI_ACCESSORIES);

    return (
        <div className="space-y-6 lg:space-y-10">
            <section className="text-center space-y-4 max-w-3xl mx-auto px-4">
                <h1 className="text-4xl md:text-[40px] font-display font-bold text-fm-text mb-4 leading-tight">
                    Una Vita che continua a germogliare
                </h1>
                
                <p className="text-lg text-fm-muted font-body leading-relaxed">
                    Dire addio ai nostri piccoli amici non è mai una fine, ma l&apos;inizio di un nuovo modo di restare vicini. In FloreMoria crediamo che l&apos;energia e l&apos;amore incondizionato che il tuo compagno di vita ti ha donato non debbano svanire, ma possano trovare una nuova casa dove continuare a crescere.
                </p>
            </section>

            <div className="px-4">
                <ProductGrid products={animalProducts} />
            </div>

            <section className="max-w-4xl mx-auto px-4">
                <div className="bg-[#FBF6EF] p-5 sm:p-7 md:p-10 rounded-[22px] md:rounded-[30px] shadow-sm text-center border border-fm-rose-soft/30">
                    <p className="text-fm-muted font-body leading-relaxed max-w-2xl mx-auto text-[14px] sm:text-base">
                        Abbiamo scelto di non offrirti fiori recisi, ma creature viventi. La nostra filosofia si basa sul <strong>trasferimento della vita</strong>: la scintilla del tuo piccolo amico, la sua gioia e il suo ricordo si trasferiscono simbolicamente nella pianta che sceglierai.
                    </p>
                </div>
            </section>

            <section className="max-w-4xl mx-auto px-4">
                <div className="bg-white p-5 sm:p-7 md:p-10 rounded-[22px] md:rounded-[30px] shadow-sm text-center border border-fm-rose-soft/30">
                    <p className="text-fm-muted font-body leading-relaxed max-w-2xl mx-auto text-[14px] sm:text-base">
                        Dopo la funzione o il momento del saluto, porta questa pianta a casa con te. Guardala germogliare sul tuo balcone o nel tuo salotto; ogni nuova foglia sarà un segno della sua presenza, ogni fioritura un richiamo al suo spirito. Prendersi cura di questa pianta significa continuare a prendersi cura di lui, trasformando il dolore in un gesto quotidiano di vita e speranza.
                    </p>
                </div>
            </section>
            
            <section className="space-y-5 sm:space-y-7 px-4 pt-6 border-t border-gray-100 max-w-[1200px] mx-auto">
                <h2 className="text-[24px] sm:text-3xl font-display font-bold text-gray-900 text-center">
                    Accessori per accompagnare il ricordo
                </h2>
                <ProductGrid products={accessoriesProducts} layout="accessoryRow" />
            </section>
        </div>
    );
}
