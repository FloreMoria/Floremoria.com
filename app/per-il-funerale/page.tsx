import { Metadata } from 'next';
import React from 'react';
import ProductGrid from '@/components/shared/ProductGrid';
import MunicipalitySearch from '@/components/MunicipalitySearch';
import AnimalBanner from '@/components/shared/AnimalBanner';
import { products } from '@/lib/products';

export const metadata: Metadata = {
    title: 'Fiori per il Funerale | Consegna floreale professionale | FloreMoria',
    description: 'Composizioni floreali per funerali e camere ardenti consegnate da fioristi locali con la massima discrezione.',
};

export default function FuneralCatalogPage() {
    const targetOrder = [
        'cuore-corona',
        'copribara',
        'piramide',
        'cuscino',
        'bouquet-memoria-imperituri',
        'bouquet-omaggio-solenne',
        'set-ceri',
        'nastro-commemorativo',
        'bouquet-cordoglio-sincero',
        'bouquet-rispetto-vicinanza',
        'margherite-gerbere',
        'kalonche'
    ];

    const funeralProducts = targetOrder
        .map(slug => products.find(p => p.slug === slug))
        .filter((p): p is NonNullable<typeof p> => p !== undefined);

    return (
        <div className="space-y-8 lg:space-y-12 pb-16">
            <section className="text-center space-y-4 max-w-3xl mx-auto">
                <h1 className="text-4xl md:text-[40px] font-display font-bold text-gray-900 mb-4 leading-tight pt-8">
                    Fiori per il funerale
                </h1>
                <p className="text-lg text-fm-muted font-body leading-relaxed">
                    Scegli tra le nostre composizioni floreali e i nostri servizi per onorare la memoria dei tuoi cari con eleganza e rispetto. La consegna è effettuata direttamente presso chiese, camere mortuarie e cimiteri per garantirti il massimo supporto.
                </p>
            </section>

            <ProductGrid products={funeralProducts} />

            <section className="bg-white rounded-[30px] lg:rounded-[50px] p-8 lg:p-16 text-center max-w-4xl mx-auto shadow-xl border border-gray-100 mt-16 md:mt-24 space-y-6">
                <h2 className="text-[32px] font-display font-semibold text-gray-900 leading-snug">
                    Servizio di consegna su tutti i Comuni italiani
                </h2>
                <p className="text-fm-muted font-body leading-relaxed max-w-2xl mx-auto text-lg">
                    Offriamo un servizio dedicato e locale per la consegna dei vostri omaggi floreali in tutti i cimiteri, camere mortuarie e chiese d&apos;Italia per garantirti un supporto presente sul territorio.
                </p>
                <div className="max-w-xl mx-auto relative z-10 pt-4">
                    <MunicipalitySearch
                        showButton={true}
                        buttonText="Cerca il comune"
                        placeholder="Inserisci il nome del comune..."
                    />
                </div>
            </section>

            <AnimalBanner />
        </div>
    );
}
