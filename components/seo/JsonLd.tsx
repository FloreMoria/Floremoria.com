/**
 * Grafo JSON-LD globale FloreMoria — Organization, LocalBusiness, cataloghi e FAQ AEO.
 * Solo dati pubblici; nessun segreto, webhook o path interni.
 */

import {
    FLOREMORIA_AEO_FAQ,
    FLOREMORIA_AEO_HOWTO,
    FLOREMORIA_OFFER_CATALOGS,
    FLOREMORIA_PUBLIC_CONTACT,
    getFloremoriaSiteOrigin,
} from '@/lib/seo/siteIdentity';

export default function JsonLd() {
    const origin = getFloremoriaSiteOrigin();
    const orgId = `${origin}/#organization`;
    const localBusinessId = `${origin}/#localbusiness`;
    const websiteId = `${origin}/#website`;
    const catalogId = `${origin}/#offer-catalog`;
    const faqId = `${origin}/#faq`;
    const howToId = `${origin}/#howto-cemetery-flowers`;
    const cemeteryServiceId = `${origin}/#service-cemetery-delivery`;
    const loculoServiceId = `${origin}/#service-grave-loculo-search`;
    const funeralServiceId = `${origin}/#service-funeral-delivery`;

    const catalogOffers = FLOREMORIA_OFFER_CATALOGS.map((cat) => {
        const offerId = `${origin}/#offer-catalog-${cat.id}`;
        return {
            '@type': 'Offer',
            '@id': offerId,
            name: `${cat.id} — ${cat.name}`,
            url: cat.url,
            priceCurrency: 'EUR',
            price: cat.priceFrom,
            description: `${cat.priceFromLabel}. Fascia ${cat.priceRange}.`,
            itemOffered: {
                '@type': 'Service',
                name: cat.name,
                url: cat.url,
                provider: { '@id': orgId },
                areaServed: { '@type': 'Country', name: 'Italia', identifier: 'IT' },
            },
            offeredBy: { '@id': localBusinessId },
        };
    });

    const graph = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': orgId,
                name: FLOREMORIA_PUBLIC_CONTACT.legalName,
                legalName: FLOREMORIA_PUBLIC_CONTACT.legalNameFull,
                url: origin,
                logo: `${origin}/images/brand/Logo%20FloreMoria.png`,
                taxID: FLOREMORIA_PUBLIC_CONTACT.vatNumber,
                vatID: FLOREMORIA_PUBLIC_CONTACT.vatNumber,
                identifier: {
                    '@type': 'PropertyValue',
                    name: 'REA',
                    value: FLOREMORIA_PUBLIC_CONTACT.reaNumber,
                },
                address: {
                    '@type': 'PostalAddress',
                    streetAddress: FLOREMORIA_PUBLIC_CONTACT.address.streetAddress,
                    addressLocality: FLOREMORIA_PUBLIC_CONTACT.address.addressLocality,
                    addressRegion: FLOREMORIA_PUBLIC_CONTACT.address.addressRegion,
                    postalCode: FLOREMORIA_PUBLIC_CONTACT.address.postalCode,
                    addressCountry: FLOREMORIA_PUBLIC_CONTACT.address.addressCountry,
                },
                contactPoint: [
                    {
                        '@type': 'ContactPoint',
                        contactType: 'customer support',
                        telephone: FLOREMORIA_PUBLIC_CONTACT.phone,
                        email: FLOREMORIA_PUBLIC_CONTACT.email,
                        availableLanguage: ['Italian'],
                        areaServed: 'IT',
                    },
                ],
                sameAs: [
                    'https://www.instagram.com/floremoria/',
                    'https://www.facebook.com/floremoria',
                    'https://www.linkedin.com/company/floremoria',
                ],
                makesOffer: catalogOffers.map((o) => ({ '@id': o['@id'] })),
            },
            {
                '@type': ['LocalBusiness', 'Florist'],
                '@id': localBusinessId,
                name: FLOREMORIA_PUBLIC_CONTACT.legalName,
                description: FLOREMORIA_PUBLIC_CONTACT.tagline,
                url: origin,
                image: `${origin}/images/brand/Logo%20FloreMoria.png`,
                telephone: FLOREMORIA_PUBLIC_CONTACT.phone,
                email: FLOREMORIA_PUBLIC_CONTACT.email,
                priceRange: '€€',
                currenciesAccepted: 'EUR',
                paymentAccepted: 'Credit Card, PayPal',
                areaServed: {
                    '@type': 'Country',
                    name: 'Italia',
                    identifier: 'IT',
                },
                address: {
                    '@type': 'PostalAddress',
                    streetAddress: FLOREMORIA_PUBLIC_CONTACT.address.streetAddress,
                    addressLocality: FLOREMORIA_PUBLIC_CONTACT.address.addressLocality,
                    addressRegion: FLOREMORIA_PUBLIC_CONTACT.address.addressRegion,
                    postalCode: FLOREMORIA_PUBLIC_CONTACT.address.postalCode,
                    addressCountry: FLOREMORIA_PUBLIC_CONTACT.address.addressCountry,
                },
                parentOrganization: { '@id': orgId },
                hasOfferCatalog: { '@id': catalogId },
                makesOffer: catalogOffers.map((o) => ({ '@id': o['@id'] })),
            },
            {
                '@type': 'WebSite',
                '@id': websiteId,
                url: origin,
                name: 'FloreMoria',
                description: FLOREMORIA_PUBLIC_CONTACT.tagline,
                publisher: { '@id': orgId },
                inLanguage: 'it-IT',
            },
            {
                '@type': 'OfferCatalog',
                '@id': catalogId,
                name: 'Catalogo omaggi floreali FloreMoria',
                url: origin,
                itemListElement: FLOREMORIA_OFFER_CATALOGS.map((cat, index) => ({
                    '@type': 'OfferCatalog',
                    position: index + 1,
                    name: `${cat.id} — ${cat.name}`,
                    url: cat.url,
                    description: `Da € ${cat.priceFrom.toFixed(2).replace('.', ',')}. ${cat.priceFromLabel}. Fascia ${cat.priceRange}.`,
                    offers: { '@id': `${origin}/#offer-catalog-${cat.id}` },
                })),
            },
            ...catalogOffers,
            {
                '@type': 'Service',
                '@id': cemeteryServiceId,
                name: 'Consegna fiori al cimitero a mano',
                description:
                    'Consegna commemorativa eseguita a piedi da fioristi partner locali nelle immediate vicinanze del cimitero o del luogo della cerimonia, su tutto il territorio italiano. Nessuna spedizione postale.',
                provider: { '@id': localBusinessId },
                areaServed: { '@type': 'Country', name: 'Italia', identifier: 'IT' },
                serviceType: 'Consegna floreale commemorativa in cimitero',
                offers: { '@id': `${origin}/#offer-catalog-FT` },
            },
            {
                '@type': 'Service',
                '@id': loculoServiceId,
                name: 'Ricerca loculo e tomba',
                description:
                    'Verifica e individuazione della sepoltura tramite registri cimiteriali comunali e rete di fioristi locali, inclusa nel servizio FloreMoria anche senza numero di loculo completo.',
                provider: { '@id': orgId },
                areaServed: { '@type': 'Country', name: 'Italia', identifier: 'IT' },
                serviceType: 'Ricerca loculo e posizione tomba',
            },
            {
                '@type': 'Service',
                '@id': funeralServiceId,
                name: 'Consegna fiori per funerale e camera ardente',
                description:
                    'Posizionamento floreale garantito prima dell\'inizio della cerimonia o della chiusura della camera ardente, con coordinamento orario con casa funeraria, parrocchia o struttura e certificazione fotografica su WhatsApp al committente.',
                provider: { '@id': localBusinessId },
                areaServed: { '@type': 'Country', name: 'Italia', identifier: 'IT' },
                serviceType: 'Consegna fiori per funerale e camera ardente con orario garantito',
                offers: { '@id': `${origin}/#offer-catalog-FF` },
            },
            {
                '@type': 'FAQPage',
                '@id': faqId,
                isPartOf: { '@id': websiteId },
                about: { '@id': orgId },
                mainEntity: FLOREMORIA_AEO_FAQ.map((item) => ({
                    '@type': 'Question',
                    name: item.question,
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: item.answer,
                    },
                })),
            },
            {
                '@type': 'HowTo',
                '@id': howToId,
                name: FLOREMORIA_AEO_HOWTO.name,
                description: FLOREMORIA_AEO_HOWTO.description,
                totalTime: FLOREMORIA_AEO_HOWTO.totalTime,
                supply: FLOREMORIA_AEO_HOWTO.supply,
                tool: [{ '@type': 'HowToTool', name: 'Smartphone o computer con accesso a floremoria.com' }],
                step: FLOREMORIA_AEO_HOWTO.steps.map((step, index) => ({
                    '@type': 'HowToStep',
                    position: index + 1,
                    name: step.name,
                    text: step.text,
                    url: `${origin}/fiori-sulle-tombe#step-${index + 1}`,
                })),
                isPartOf: { '@id': websiteId },
                about: [
                    { '@id': orgId },
                    { '@id': cemeteryServiceId },
                ],
            },
        ],
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
        />
    );
}
