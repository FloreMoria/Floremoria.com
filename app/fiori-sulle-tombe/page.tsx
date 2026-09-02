import ProductGrid from '@/components/shared/ProductGrid';
import { CATALOG_SLUGS_CIMITERO, productsBySlugOrder } from '@/lib/catalogProductOrder';
import MunicipalitySearch from '@/components/MunicipalitySearch';
import AnimalBanner from '@/components/shared/AnimalBanner';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Fiori sulle tombe | FloreMoria',
    description: 'Sfoglia i nostri omaggi floreali e servizi dedicati per onorare e ricordare i tuoi cari.',
};

export default function CatalogPage() {
    const cemeteryProducts = productsBySlugOrder(CATALOG_SLUGS_CIMITERO);

    return (
        <div className="space-y-6 lg:space-y-10">
            <section className="text-center space-y-4 max-w-3xl mx-auto">
                <h1 className="text-4xl md:text-[40px] font-display font-bold text-fm-text mb-4 leading-tight">
                    Fiori sulle tombe
                </h1>
                <p className="text-lg text-fm-muted font-body leading-relaxed">
                    Scegli tra le nostre composizioni floreali per onorare la memoria dei tuoi cari. La consegna è eseguita a mano da fioristi partner nelle immediate vicinanze del cimitero — non tramite pacco postale. Se non conosci il loculo, la ricerca sui registri cimiteriali comunali è inclusa nel servizio.
                </p>
            </section>

            <ProductGrid products={cemeteryProducts} />

            <section className="bg-white rounded-[22px] lg:rounded-[40px] px-5 py-5 sm:p-7 lg:p-12 text-center max-w-4xl mx-auto shadow-lg border border-gray-100 mt-8 md:mt-12 space-y-3 sm:space-y-5">
                <h2 className="text-[22px] sm:text-[28px] font-display font-semibold text-fm-text leading-snug">
                    Servizio di consegna su tutti i Comuni italiani
                </h2>
                <p className="text-fm-muted font-body leading-relaxed max-w-2xl mx-auto text-[14px] sm:text-base">
                    Rete nazionale di fioristi locali: ogni ordine è preparato in zona e consegnato a piedi in cimitero su tutto il territorio italiano. Ricevi la foto di conferma ad alta risoluzione su WhatsApp dopo la posa.
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
