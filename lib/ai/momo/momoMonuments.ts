/**
 * MOMO — catalogo monumenti/personaggi storici certificati.
 * Solo voci documentate: vietato inventare tombe o cimiteri.
 * Arricchito con la dimensione paesaggistica ("Visione") e botanica ("Martina").
 */
export type MonumentRecord = {
    id: string;
    historicalFigure: string;
    cemetery: string;
    city: string;
    country: string;
    /** Dimensione paesaggistica, luce naturale e atmosfera visiva ("Visione"). */
    visionLandscape: string;
    /** Fonte pubblica verificabile (enciclopedia, archivio storico, comune). */
    sources: string[];
    sculpturalNotes: string;
    /** Note botaniche sobrie a cura di Martina (fiori, essenze e simbolismo). */
    floralNotes?: string;
    coordinatesHint?: string;
    verified: true;
};

/**
 * Catalogo delle "Visioni dei Grandi Cimiteri Italiani" — ogni voce ha fonti verificate.
 */
export const CERTIFIED_MONUMENTS: MonumentRecord[] = [
    {
        id: 'alessandro-volta-camnago',
        historicalFigure: 'Alessandro Volta',
        cemetery: 'Cimitero di Camnago Volta',
        city: 'Camnago Volta (Como)',
        country: 'IT',
        visionLandscape:
            'La visione delle acque scintillanti del Lago di Como e delle montagne silenziose che incorniciano il mausoleo neoclassico circolare.',
        sources: [
            'https://it.wikipedia.org/wiki/Alessandro_Volta',
            'Comune di Como — Luoghi della Memoria: Camnago Volta',
        ],
        sculpturalNotes:
            'Tempio neoclassico circolare a cupola con pronao corinzio, busto scultoreo in marmo di Giovanni Battista Comolli e rilievo con la pila voltaica.',
        floralNotes:
            'Composizione sobria di rami di alloro, edera perenne e foglie d\'ulivo alla base del basamento marmoreo.',
        coordinatesHint: 'Camnago Volta, Como',
        verified: true,
    },
    {
        id: 'porte-sante-san-miniato-firenze',
        historicalFigure: 'Carlo Collodi & Pellegrino Artusi',
        cemetery: 'Cimitero delle Porte Sante (San Miniato al Monte)',
        city: 'Firenze',
        country: 'IT',
        visionLandscape:
            'La visione su tutta Firenze dall\'alto della collina di San Miniato, tra cipressi secolari e marmi rinascimentali dorati dalla luce toscana.',
        sources: [
            'https://it.wikipedia.org/wiki/Cimitero_delle_Porte_Sante',
            'https://it.wikipedia.org/wiki/Carlo_Collodi',
        ],
        sculpturalNotes:
            'Edicole neoclassiche, monumenti liberty e cappelle gentilizie affacciate sulla cupola del Brunelleschi.',
        floralNotes:
            'Gigli candidi e rose damascene sfumate, omaggio sobrio alla purezza dell\'ingegno e della cultura fiorentina.',
        coordinatesHint: 'Via delle Porte Sante, Firenze',
        verified: true,
    },
    {
        id: 'staglieno-genova',
        historicalFigure: 'Fabrizio De André & Constance Lloyd',
        cemetery: 'Cimitero Monumentale di Staglieno',
        city: 'Genova',
        country: 'IT',
        visionLandscape:
            'La visione della collina boscosa e delle gallerie scultoree più celebri d\'Europa, dove la pietra sembra respirare tra ombre e luce radente.',
        sources: [
            'https://it.wikipedia.org/wiki/Cimitero_monumentale_di_Staglieno',
            'https://it.wikipedia.org/wiki/Fabrizio_De_Andr%C3%A9',
        ],
        sculpturalNotes:
            'Capolavori del realismo borghese e del simbolismo (Giulio Monteverde, Lorenzo Orengo) incastonati nella macchia mediterranea.',
        floralNotes:
            'Garofani rossi discreti e piccoli rametti di mirto ligure, simbolo di poesia e fedeltà al ricordo.',
        coordinatesHint: 'Piazzale Resasco, Genova',
        verified: true,
    },
    {
        id: 'certosa-di-bologna',
        historicalFigure: 'Giosuè Carducci & Giorgio Morandi',
        cemetery: 'Cimitero Monumentale della Certosa',
        city: 'Bologna',
        country: 'IT',
        visionLandscape:
            'La visione dei chiostri infiniti e dei loggiati dell\'antico convento certosino, immersi in un silenzio metafisico scandito dalla luce porticata.',
        sources: [
            'https://it.wikipedia.org/wiki/Cimitero_monumentale_della_Certosa_di_Bologna',
            'Museo Civico del Risorgimento — Certosa di Bologna',
        ],
        sculpturalNotes:
            'Evoluzione artistica dal neoclassico al liberty; loggiati porticati, sale delle tombe e chiostri monumentali.',
        floralNotes:
            'Edera perenne e rose bianche alla base delle grandi arcate, in sintonia con la compostezza emiliana.',
        coordinatesHint: 'Via della Certosa, Bologna',
        verified: true,
    },
    {
        id: 'san-fruttuoso-costieri-liguria',
        historicalFigure: 'Tombe gentilizie dei Doria & Marinai del Golfo',
        cemetery: 'Cimiteri Costieri e Abbazia di San Fruttuoso',
        city: 'Camogli / Portovenere (Riviera Ligure)',
        country: 'IT',
        visionLandscape:
            'La visione del mare aperto e del fragore delle onde a strapiombo sulle scogliere, dove il vento salmastro incontra la quiete dei cipressi marittimi.',
        sources: [
            'https://it.wikipedia.org/wiki/Abbazia_di_San_Fruttuoso',
            'FAI — Fondo per l\'Ambiente Italiano: San Fruttuoso',
        ],
        sculpturalNotes:
            'Lapidi e arche gentilizie in marmo bianco e ardesia locale, incastonate tra roccia viva e salsedine.',
        floralNotes:
            'Elicriso marittimo, lavanda selvatica e rami di rosmarino che resistono al vento del mare.',
        coordinatesHint: 'Baia di San Fruttuoso, Camogli',
        verified: true,
    },
    {
        id: 'manzoni-monumentale-milano',
        historicalFigure: 'Alessandro Manzoni',
        cemetery: 'Cimitero Monumentale di Milano',
        city: 'Milano',
        country: 'IT',
        visionLandscape:
            'La visione maestosa del Famedio e delle cattedrali di pietra gotico-lombarde, scrigno d\'arte e memoria civile nel cuore della metropoli.',
        sources: [
            'https://it.wikipedia.org/wiki/Cimitero_Monumentale_di_Milano',
            'Comune di Milano — Monumentale',
        ],
        sculpturalNotes:
            'Sepoltura nel Famedio; viali alberati con capolavori dell\'architettura funeraria e della scultura ottocentesca.',
        floralNotes:
            'Composizione lineare di rose bianche e felci alpine, sobrie e rigorose.',
        coordinatesHint: 'Piazzale Cimitero Monumentale, Milano',
        verified: true,
    },
    {
        id: 'goffredo-mameli-verano-roma',
        historicalFigure: 'Goffredo Mameli & Eroi della Repubblica',
        cemetery: 'Cimitero del Verano / Mausoleo Gianicolense',
        city: 'Roma',
        country: 'IT',
        visionLandscape:
            'La visione solenne tra pini marittimi monumentali, viali alberati e il respiro eterno della Città Eterna.',
        sources: [
            'https://it.wikipedia.org/wiki/Cimitero_del_Verano',
            'https://it.wikipedia.org/wiki/Goffredo_Mameli',
        ],
        sculpturalNotes:
            'Monumenti patriottici, epigrafi storiche e rilievi scultorei dedicati ai costruttori dell\'Italia unita.',
        floralNotes:
            'Rami d\'alloro intrecciati e fiori di campo sobri, omaggio alla memoria civile.',
        coordinatesHint: 'Piazzale del Verano, Roma',
        verified: true,
    },
];

export function getMonumentById(id: string): MonumentRecord | null {
    return CERTIFIED_MONUMENTS.find((m) => m.id === id) || null;
}

export function assertMonumentCertified(id: string): MonumentRecord {
    const m = getMonumentById(id);
    if (!m || m.verified !== true || !m.sources.length) {
        throw new Error(
            `MOMO STOP: monumento/sepoltura non certificati come reali (id=${id}). Generazione bloccata.`
        );
    }
    return m;
}
