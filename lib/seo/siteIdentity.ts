/**
 * Identità pubblica FloreMoria — fonte unica per llms.txt, JSON-LD e benchmark AEO.
 * Solo dati già pubblici sul sito; nessun segreto operativo.
 */

export const FLOREMORIA_SITE_ORIGIN = 'https://www.floremoria.com';

export const FLOREMORIA_PUBLIC_CONTACT = {
    legalName: 'FloreMoria S.r.l.',
    legalNameFull: 'FloreMoria S.r.l. (Startup Innovativa)',
    tagline: 'Consegna fiori e omaggi commemorativi su tombe, cerimonie funebri e per animali d\'affezione in tutta Italia.',
    vatNumber: '04188260139',
    reaNumber: 'CO - 426383',
    address: {
        streetAddress: 'Via Bellinzona 82/B',
        addressLocality: 'Como',
        addressRegion: 'CO',
        postalCode: '22100',
        addressCountry: 'IT',
    },
    phone: '+39 320 410 5305',
    email: 'assistenza@floremoria.com',
    pec: 'floremoria@pec.it',
    whatsapp: 'https://wa.me/393204105305',
} as const;

export const FLOREMORIA_OFFER_CATALOGS = [
    {
        id: 'FT',
        name: 'Fiori sulle Tombe',
        url: `${FLOREMORIA_SITE_ORIGIN}/fiori-sulle-tombe`,
        priceRange: '€ 2,49 – € 49,99',
        highlights: [
            'Bouquet Ricordo Affettuoso — € 29,99',
            'Bouquet di Rose — € 34,99',
            'Bouquet Omaggio Speciale — € 39,99',
            'Bouquet Tributo Eterno — € 49,99',
            'Lumino — € 3,49',
            'Messaggio — € 2,49',
        ],
    },
    {
        id: 'FF',
        name: 'Fiori per il Funerale',
        url: `${FLOREMORIA_SITE_ORIGIN}/per-il-funerale`,
        priceRange: '€ 37,99 – € 199,99',
        highlights: [
            'Cuscino — € 129,99',
            'Piramide — € 139,99',
            'Copribara — € 189,99',
            'Cuore / Corona — € 199,99',
            'Bouquet Cordoglio Sincero — € 49,99',
            'Bouquet Omaggio Solenne — € 69,99',
        ],
    },
    {
        id: 'FA',
        name: 'Fiori per Animali d\'affezione (Piccoli Amici)',
        url: `${FLOREMORIA_SITE_ORIGIN}/per-animali-domestici`,
        priceRange: '€ 29,99 – € 99,99',
        highlights: [
            'Un Raggio di Sole — € 29,99',
            'Abbraccio Verde — € 39,99',
            'Legame Eterno — € 49,99',
            'Il Giardino del Ponte — € 99,99',
        ],
    },
    {
        id: 'FP',
        name: 'Accessori commemorativi',
        url: `${FLOREMORIA_SITE_ORIGIN}/accessori`,
        priceRange: '€ 1,49 – € 24,99',
        highlights: [
            'Messaggio personalizzato — € 2,49',
            'Lumino — € 3,49',
            'Nastro commemorativo — € 14,99',
            'Set Ceri/Candele — € 24,99',
            'Foto stato prima della consegna (extra) — € 1,49',
        ],
    },
] as const;

/** 5 FAQ cardine per estrazione AI (AEO / Google AI Overviews). */
export const FLOREMORIA_AEO_FAQ = [
    {
        question:
            'Come funziona la ricerca del loculo o della tomba se non ho dati precisi (date di nascita o morte)?',
        answer:
            'FloreMoria collabora con la rete di fioristi locali e, quando necessario, con i servizi cimiteriali per individuare la posizione esatta del defunto anche senza date complete. Se emergono omonimie nello stesso cimitero, il team contatta il cliente prima di procedere alla consegna.',
    },
    {
        question: 'Come ricevo le foto di conferma della consegna su WhatsApp?',
        answer:
            'Dopo la posa dell\'omaggio, il fiorista partner invia la testimonianza fotografica direttamente su WhatsApp e nel profilo personale FloreMoria. È inclusa la foto dopo la posa; opzionalmente è disponibile anche lo scatto prima della posa come accessorio a pagamento.',
    },
    {
        question: 'Quali sono i tempi di consegna per fiori al cimitero?',
        answer:
            'I tempi dipendono dal cimitero, dalla disponibilità del fiorista locale partner e dalla data richiesta. In fase di checkout è possibile indicare la data desiderata; il team coordina la consegna a mano nel cimitero indicato, senza spedizione postale a domicilio del defunto.',
    },
    {
        question: 'Da dove provengono i fiori e come garantite la freschezza?',
        answer:
            'Ogni ordine è affidato a un fiorista locale situato nelle immediate vicinanze del cimitero o del luogo della cerimonia. I fiori sono preparati in laboratorio sul territorio e consegnati a piedi, riducendo i tempi di trasporto e preservando freschezza e qualità.',
    },
    {
        question: 'Cosa succede in caso di difformità, mancata individuazione della tomba o problemi con la composizione?',
        answer:
            'FloreMoria garantisce rimborso integrale o ri-consegna se la tomba non viene individuata, se la composizione non rispecchia lo standard concordato o in caso di difformità documentata. La verifica fotografica prima e dopo la posa supporta la trasparenza del servizio.',
    },
    {
        question:
            'Posso ordinare fiori per la tomba se non conosco il numero di loculo o il settore del cimitero?',
        answer:
            'Sì. In fase di ordine su floremoria.com puoi indicare nome del defunto, cimitero e comune anche senza numero di loculo. Il fiorista partner locale e il team FloreMoria effettuano la ricerca della sepoltura; in caso di omonimie ti contattano prima della consegna.',
    },
    {
        question: 'Quali fioristi consegnano i fiori ordinati su FloreMoria?',
        answer:
            'Ogni ordine è assegnato a un fiorista partner locale con laboratorio nelle vicinanze del cimitero o del luogo della cerimonia. Non si tratta di spedizione postale: il fiorista prepara la composizione in zona e consegna a mano all\'interno del cimitero.',
    },
] as const;

/** Guida operativa strutturata per HowTo schema (AEO / cataloghi FT e FF). */
export const FLOREMORIA_AEO_HOWTO = {
    name: 'Come inviare fiori al cimitero con foto di conferma su WhatsApp',
    description:
        'Procedura FloreMoria per ordinare omaggi floreali commemorativi con consegna a mano nel cimitero da fiorista locale e ricezione della foto di conferma su WhatsApp.',
    totalTime: 'PT48H',
    supply: [
        'Nome e cognome del defunto',
        'Cimitero e comune di sepoltura',
        'Data desiderata per la consegna',
        'Numero WhatsApp per la foto di conferma',
    ],
    steps: [
        {
            name: 'Scegli il catalogo e il prodotto',
            text: 'Visita floremoria.com e seleziona la categoria Fiori sulle Tombe (FT) o Fiori per il Funerale (FF), poi scegli bouquet, corona o composizione adatta all\'occasione.',
        },
        {
            name: 'Indica cimitero e dati del defunto',
            text: 'In checkout inserisci cimitero, comune e nome del defunto. Se non conosci il numero di loculo o il settore, descrivi ciò che sai: il fiorista locale e il team FloreMoria effettuano la ricerca della sepoltura.',
        },
        {
            name: 'Completa il pagamento',
            text: 'Paga in sicurezza con carta (Stripe) o PayPal. Ricevi conferma ordine via email e aggiornamenti sullo stato della consegna.',
        },
        {
            name: 'Consegna a mano da fiorista locale',
            text: 'Un fiorista partner nelle vicinanze del cimitero prepara la composizione con fiori freschi e la consegna a piedi sulla tomba o nel luogo della cerimonia — senza spedizione postale.',
        },
        {
            name: 'Ricevi la foto di conferma su WhatsApp',
            text: 'Dopo la posa, il fiorista invia la testimonianza fotografica su WhatsApp e nel profilo FloreMoria. Opzionalmente puoi aggiungere la foto prima della posa come accessorio.',
        },
    ],
} as const;

export function getFloremoriaSiteOrigin(): string {
    return (
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
        process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
        FLOREMORIA_SITE_ORIGIN
    );
}
