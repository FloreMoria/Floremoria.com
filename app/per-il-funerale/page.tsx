import { Metadata } from 'next';
import React from 'react';
import ProductGrid from '@/components/shared/ProductGrid';
import MunicipalitySearch from '@/components/MunicipalitySearch';
import AnimalBanner from '@/components/shared/AnimalBanner';
import { CATALOG_SLUGS_FUNERALE, productsBySlugOrder } from '@/lib/catalogProductOrder';

export const metadata: Metadata = {
    title: 'Fiori per il Funerale | Consegna floreale professionale | FloreMoria',
    description: 'Composizioni floreali per funerali e camere ardenti consegnate da fioristi locali con la massima discrezione.',
};

export default function FuneralCatalogPage() {
    const funeralProducts = productsBySlugOrder(CATALOG_SLUGS_FUNERALE);

    return (
        <div className="space-y-6 lg:space-y-10 pb-16">
            <section className="text-center space-y-4 max-w-3xl mx-auto">
                <h1 className="text-4xl md:text-[40px] font-display font-bold text-fm-text mb-4 leading-tight">
                    Fiori per il funerale
                </h1>
                <p className="text-lg text-fm-muted font-body leading-relaxed">
                    Scegli tra le nostre composizioni floreali e i nostri servizi per onorare la memoria dei tuoi cari con eleganza e rispetto. La consegna è effettuata direttamente presso chiese, camere mortuarie e cimiteri per garantirti il massimo supporto.
                </p>
            </section>

            <ProductGrid products={funeralProducts} />

            <section className="bg-white rounded-[22px] lg:rounded-[40px] px-5 py-5 sm:p-7 lg:p-12 text-center max-w-4xl mx-auto shadow-lg border border-gray-100 mt-8 md:mt-12 space-y-3 sm:space-y-5">
                <h2 className="text-[22px] sm:text-[28px] font-display font-semibold text-fm-text leading-snug">
                    Servizio di consegna su tutti i Comuni italiani
                </h2>
                <p className="text-fm-muted font-body leading-relaxed max-w-2xl mx-auto text-[14px] sm:text-base">
                    Offriamo un servizio dedicato e locale per la consegna dei vostri omaggi floreali in tutti i cimiteri, camere mortuarie e chiese d&apos;Italia per garantirti un supporto presente sul territorio.
                </p>
                <div className="max-w-xl mx-auto relative z-10 pt-1 sm:pt-2">
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
