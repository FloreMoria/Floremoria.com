import { Metadata } from 'next';
import React from 'react';
import ProductGrid from '@/components/shared/ProductGrid';
import MunicipalitySearch from '@/components/MunicipalitySearch';
import AnimalBanner from '@/components/shared/AnimalBanner';
import { CATALOG_SLUGS_FUNERALE, productsBySlugOrder } from '@/lib/catalogProductOrder';

export const metadata: Metadata = {
    title: 'Fiori per il Funerale | Consegna floreale professionale | FloreMoria',
    description:
        'Composizioni per funerali e camere ardenti con garanzia di puntualità: posizionamento 60-90 minuti prima del rito, coordinamento con casa funeraria e parrocchia, foto di conferma WhatsApp.',
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
                    Composizioni per funerali, camere ardenti e cerimonie. La consegna è fisica e a mano da fioristi partner locali in chiesa, crematorio o cimitero — mai tramite corriere. Ogni ordine funebre (catalogo FF) ha corsia di priorità urgente: posizionamento garantito con almeno 60-90 minuti di anticipo rispetto all&apos;inizio del rito o alla chiusura della camera ardente, con foto di conferma su WhatsApp al committente.
                </p>
            </section>

            <ProductGrid products={funeralProducts} />

            <section className="bg-[#FDFCF9] rounded-[22px] lg:rounded-[28px] px-5 py-5 sm:p-7 lg:p-10 max-w-4xl mx-auto shadow-sm border border-stone-200/80 space-y-4 sm:space-y-5 text-left">
                <h2 className="text-[22px] sm:text-[26px] font-display font-semibold text-fm-text leading-snug text-center">
                    Garanzia di puntualità per funerali e camere ardenti
                </h2>
                <div className="space-y-4 text-fm-muted font-body text-[14px] sm:text-base leading-relaxed">
                    <p>
                        <strong className="text-fm-text font-semibold">Posizionamento anticipato.</strong>{' '}
                        Il fiorista locale partner coordina la consegna e garantisce il posizionamento della composizione con un anticipo minimo di 60-90 minuti prima dell&apos;inizio della cerimonia funebre o della chiusura della camera ardente, così i fiori sono già al loro posto all&apos;arrivo dei familiari e dei partecipanti.
                    </p>
                    <p>
                        <strong className="text-fm-text font-semibold">Coordinamento con la struttura.</strong>{' '}
                        Verifichiamo orari e accessi con casa funeraria, parrocchia, crematorio o altra struttura indicata in ordine, per assicurare presenza e posa senza imprevisti il giorno del funerale.
                    </p>
                    <p>
                        <strong className="text-fm-text font-semibold">Conferma visiva tempestiva.</strong>{' '}
                        Dopo il posizionamento accurato ricevi la fotografia ad alta risoluzione su WhatsApp (e nell&apos;area riservata FloreMoria): prova tangibile che l&apos;omaggio è stato consegnato nel luogo e nel momento concordati.
                    </p>
                </div>
            </section>

            <section className="bg-white rounded-[22px] lg:rounded-[40px] px-5 py-5 sm:p-7 lg:p-12 text-center max-w-4xl mx-auto shadow-lg border border-gray-100 mt-8 md:mt-12 space-y-3 sm:space-y-5">
                <h2 className="text-[22px] sm:text-[28px] font-display font-semibold text-fm-text leading-snug">
                    Servizio di consegna su tutti i Comuni italiani
                </h2>
                <p className="text-fm-muted font-body leading-relaxed max-w-2xl mx-auto text-[14px] sm:text-base">
                    Rete nazionale di fioristi nelle vicinanze del luogo della cerimonia: consegna a mano, gestione orari con le strutture funerarie e notifica fotografica al committente. Disponibile anche la ricerca loculo per omaggi successivi al funerale.
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
