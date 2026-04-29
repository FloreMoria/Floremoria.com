import { Metadata } from 'next';
import React from 'react';
import ProductGrid from '@/components/shared/ProductGrid';
import { products } from '@/lib/products';

export const metadata: Metadata = {
    title: 'Una Vita che continua a germogliare - Fiori per i Piccoli Amici | FloreMoria',
    description: 'Il ricordo vivente dei nostri piccoli amici. Piante per addio basate sul trasferimento vitale.',
    keywords: 'trasferimento vitale piccoli amici, ricordo vivente, piante per addio',
};

export default function PerAnimaliDomesticiPage() {
    const mainTargetOrder = [
        'un-raggio-di-sole',
        'abbraccio-verde',
        'legame-eterno',
        'battito-di-foglia',
        'anima-pura',
        'il-giardino-del-ponte'
    ];
    
    const accessoriesOrder = [
        'messaggio',
        'lumino',
        'set-ceri',
        'nastro-commemorativo'
    ];

    const animalProducts = mainTargetOrder
        .map(slug => products.find(p => p.slug === slug))
        .filter((p): p is NonNullable<typeof p> => p !== undefined);

    const accessoriesProducts = accessoriesOrder
        .map(slug => products.find(p => p.slug === slug))
        .filter((p): p is NonNullable<typeof p> => p !== undefined);

    const row1 = animalProducts.slice(0, 3);
    const row2 = animalProducts.slice(3, 6);

    return (
        <div className="space-y-12 lg:space-y-16 pb-16">
            <section className="text-center space-y-6 max-w-4xl mx-auto px-4 pt-12">
                <h1 className="text-4xl md:text-[44px] font-display font-bold text-gray-900 leading-tight">
                    Una Vita che continua a germogliare
                </h1>
                
                <p className="text-xl text-fm-muted font-body leading-relaxed max-w-3xl mx-auto">
                    Dire addio ai nostri piccoli amici non è mai una fine, ma l&apos;inizio di un nuovo modo di restare vicini. In FloreMoria crediamo che l&apos;energia e l&apos;amore incondizionato che il tuo compagno di vita ti ha donato non debbano svanire, ma possano trovare una nuova casa dove continuare a crescere.
                </p>
            </section>

            <div className="px-4">
                <ProductGrid products={row1} />
            </div>

            <section className="max-w-4xl mx-auto px-4">
                <div className="bg-[#FBF6EF] p-8 md:p-12 rounded-[30px] shadow-sm text-center border border-fm-rose-soft/30">
                    <p className="text-lg md:text-xl text-fm-text font-display leading-relaxed">
                        Abbiamo scelto di non offrirti fiori recisi, ma creature viventi. La nostra filosofia si basa sul <strong>trasferimento della vita</strong>: la scintilla del tuo piccolo amico, la sua gioia e il suo ricordo si trasferiscono simbolicamente nella pianta che sceglierai.
                    </p>
                </div>
            </section>

            <div className="px-4">
                <ProductGrid products={row2} />
            </div>

            <section className="max-w-4xl mx-auto px-4">
                <div className="bg-white p-8 md:p-12 rounded-[30px] shadow-sm text-center border border-fm-rose-soft/30">
                    <p className="text-lg md:text-xl text-fm-text font-display leading-relaxed">
                        Dopo la funzione o il momento del saluto, porta questa pianta a casa con te. Guardala germogliare sul tuo balcone o nel tuo salotto; ogni nuova foglia sarà un segno della sua presenza, ogni fioritura un richiamo al suo spirito. Prendersi cura di questa pianta significa continuare a prendersi cura di lui, trasformando il dolore in un gesto quotidiano di vita e speranza.
                    </p>
                </div>
            </section>
            
            <section className="space-y-8 px-4 pt-8 border-t border-gray-100 max-w-[1200px] mx-auto">
                <h2 className="text-3xl font-display font-bold text-gray-900 text-center">
                    Accessori per accompagnare il ricordo
                </h2>
                <ProductGrid products={accessoriesProducts} />
            </section>
        </div>
    );
}
