/**
 * FAQ pubbliche — fonte unica per accordion assistenza, JSON-LD globale e AEO.
 * Ogni risposta è allineata al testo visibile negli accordion (nessuna divergenza markup/UI).
 */

export type PublicFaqItem = {
    id: string;
    question: string;
    answer: string;
    /** Colonna layout assistenza (A = ricerca/sicurezza, B = personalizzazione) */
    column?: 'A' | 'B';
};

export const FLOREMORIA_ASSISTENZA_FAQ: PublicFaqItem[] = [
    {
        id: 'loculo-date-mancanti',
        column: 'A',
        question: 'Non conosco le date esatte di nascita o di morte del mio caro.',
        answer:
            'Puoi ordinare comunque: indica nome e cognome del defunto, cimitero e comune. Il team FloreMoria e il fiorista partner locale avviano la verifica incrociando i registri cimiteriali comunali e le informazioni disponibili, anche senza date complete. La ricerca del loculo o della tomba è inclusa nel servizio; ti contattiamo prima della consegna se servono chiarimenti.',
    },
    {
        id: 'loculo-non-trovato',
        column: 'A',
        question: 'Cosa succede se la tomba o il loculo non vengono individuati?',
        answer:
            'Verifichiamo sempre la posizione corretta prima della posa. Se, nonostante la ricerca sui registri cimiteriali e il supporto del fiorista locale, la sepoltura non fosse individuabile, procediamo al rimborso integrale dell\'ordine.',
    },
    {
        id: 'omonimia',
        column: 'A',
        question: 'Come gestite i casi di omonimia nello stesso cimitero?',
        answer:
            'Se nei registri o sul campo emergono più omonimi, ti contattiamo con i dettagli utili (settore, loculo, date se note) per confermare insieme l\'identità corretta prima di consegnare i fiori.',
    },
    {
        id: 'freschezza-consegna',
        column: 'A',
        question: 'Da dove provengono i fiori e come garantite la freschezza?',
        answer:
            'Ogni ordine è affidato a un fiorista partner con laboratorio nelle immediate vicinanze del cimitero o del luogo della cerimonia. I fiori sono preparati in zona e consegnati a mano a piedi sul loculo o nella chiesa indicata: non utilizziamo spedizioni postali né pacchi tramite corriere.',
    },
    {
        id: 'difformita',
        column: 'A',
        question: 'Cosa succede in caso di problemi con la composizione scelta?',
        answer:
            'Se la composizione consegnata non rispecchia lo standard o la tipologia ordinata, documentata anche tramite le foto di conferma, procediamo al rimborso integrale o alla ri-consegna secondo quanto previsto dal servizio.',
    },
    {
        id: 'foto-conferma',
        column: 'A',
        question: "Come riceverò la conferma dell'avvenuta consegna?",
        answer:
            'Ricevi fino a 2 fotografie ad alta risoluzione: opzionalmente lo stato del luogo prima della posa (accessorio da €1,49) e, inclusa in ogni ordine, la foto dopo la posa. Le immagini ti arrivano su WhatsApp e nell\'area riservata FloreMoria; su richiesta anche via email a assistenza@floremoria.com.',
    },
    {
        id: 'nastro-biglietto',
        column: 'B',
        question: 'Posso personalizzare il nastro o il biglietto?',
        answer:
            'Sì. In fase di checkout puoi inserire il messaggio dedicato o richiedere il nastro commemorativo personalizzato, a seconda del prodotto scelto nel catalogo FT, FF o accessori.',
    },
    {
        id: 'funerale-chiesa',
        column: 'B',
        question: 'Posso consegnare in chiesa o durante il funerale?',
        answer:
            'Sì. Per il catalogo Fiori per il Funerale (FF) coordiniamo la consegna in chiesa, camera ardente o crematorio con il fiorista locale partner, allineandoci agli orari della cerimonia. La consegna è sempre fisica e a mano, non tramite corriere.',
    },
    {
        id: 'funerale-puntualita',
        column: 'B',
        question: 'Come garantite la puntualità della consegna per funerali e camere ardenti?',
        answer:
            'Gli ordini del catalogo FF (Fiori per il Funerale) hanno corsia di priorità urgente. Il fiorista partner locale si attiva subito, concorda orari e accesso con casa funeraria, parrocchia o struttura indicata e garantisce il posizionamento della composizione con almeno 60-90 minuti di anticipo rispetto all\'inizio del rito o alla chiusura della camera ardente. Dopo la posa accurata inviamo tempestivamente la foto di conferma ad alta risoluzione su WhatsApp al committente.',
    },
    {
        id: 'testo-biglietto',
        column: 'B',
        question: 'Cosa scrivo sul biglietto se non trovo le parole?',
        answer:
            'Durante il checkout trovi suggerimenti di testo sobri e appropriati. Puoi anche contattare assistenza@floremoria.com o WhatsApp +39 320 410 5305 per un aiuto personalizzato.',
    },
    {
        id: 'pagamento',
        column: 'B',
        question: 'Quali sono i metodi di pagamento accettati?',
        answer:
            'Accettiamo carte di credito e debito (Stripe) e PayPal. I pagamenti sono crittografati; non conserviamo i dati della carta.',
    },
    {
        id: 'stagionalita',
        column: 'B',
        question: 'I fiori scelti sono stagionali?',
        answer:
            'I fioristi partner utilizzano fiori freschi di stagione, rispettando palette e stile della composizione ordinata. La preparazione avviene in laboratorio locale prima della consegna a mano nel cimitero.',
    },
    {
        id: 'ricorrenze',
        column: 'B',
        question: 'Offrite abbonamenti per la cura costante?',
        answer:
            'Puoi programmare ricorrenze e nuovi omaggi dal profilo o contattando l\'assistenza. Il Calendario della Memoria invia promemoria per anniversari e giorni del ricordo.',
    },
];

/** FAQ cardine per schema globale — stesso testo degli accordion assistenza. */
export const FLOREMORIA_AEO_FAQ = FLOREMORIA_ASSISTENZA_FAQ.map(({ question, answer }) => ({
    question,
    answer,
}));

export function buildFaqPageJsonLd(faq: PublicFaqItem[] = FLOREMORIA_ASSISTENZA_FAQ) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
            },
        })),
    };
}

/** Tre FAQ cardine per estrazione su cataloghi (testo identico agli accordion assistenza). */
export const FLOREMORIA_CATALOG_FAQ_IDS = [
    'freschezza-consegna',
    'foto-conferma',
    'loculo-date-mancanti',
] as const;

export function getCatalogFaqSubset(): PublicFaqItem[] {
    const ids = new Set<string>(FLOREMORIA_CATALOG_FAQ_IDS);
    return FLOREMORIA_ASSISTENZA_FAQ.filter((item) => ids.has(item.id));
}
