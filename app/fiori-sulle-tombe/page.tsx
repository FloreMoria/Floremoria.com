import { products } from '@/lib/products';
import ProductGrid from '@/components/shared/ProductGrid';
import MunicipalitySearch from '@/components/MunicipalitySearch';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Omaggi Floreali | FloreMoria',
    description: 'Sfoglia i nostri omaggi floreali e servizi dedicati per onorare e ricordare i tuoi cari.',
};

export default function CatalogPage() {
    const targetOrder = [
        'bouquet-ricordo-affettuoso',
        'bouquet-di-rose',
        'bouquet-omaggio-speciale',
        'bouquet-tributo-eterno',
        'lumino',
        'messaggio'
    ];

    const cemeteryProducts = targetOrder
        .map(slug => products.find(p => p.slug === slug))
        .filter((p): p is NonNullable<typeof p> => p !== undefined);

    return (
        <div className="space-y-8 lg:space-y-12">
            <section className="text-center space-y-4 max-w-3xl mx-auto">
                <h1 className="text-4xl md:text-[40px] font-display font-bold text-fm-text mb-4 leading-tight">
                    Omaggi floreali
                </h1>
                <p className="text-lg text-fm-muted font-body leading-relaxed">
                    Scegli tra le nostre composizioni floreali e i nostri servizi per onorare la memoria dei tuoi cari con eleganza e rispetto. La consegna è effettuata direttamente presso le strutture cimiteriali.
                </p>
            </section>

            <ProductGrid products={cemeteryProducts} />

            <section className="bg-white rounded-[30px] lg:rounded-[50px] p-8 lg:p-16 text-center max-w-4xl mx-auto shadow-xl border border-gray-100 mt-16 md:mt-24 space-y-6">
                <h2 className="text-[32px] font-display font-semibold text-fm-text leading-snug">
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
        </div>
    );
}
