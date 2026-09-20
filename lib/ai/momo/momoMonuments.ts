/**
 * MOMO — catalogo monumenti/personaggi storici certificati.
 * Solo voci documentate: vietato inventare tombe o cimiteri.
 */
export type MonumentRecord = {
    id: string;
    historicalFigure: string;
    cemetery: string;
    city: string;
    country: string;
    /** Fonte pubblica verificabile (enciclopedia, sito istituzionale, archivio). */
    sources: string[];
    sculpturalNotes: string;
    coordinatesHint?: string;
    verified: true;
};

/**
 * Catalogo minimale seed — ogni voce deve avere almeno una fonte verificabile.
 * Estendere solo con monumenti documentati (mai placeholder inventati).
 */
export const CERTIFIED_MONUMENTS: MonumentRecord[] = [
    {
        id: 'alessandro-volta-camnago',
        historicalFigure: 'Alessandro Volta',
        cemetery: 'Cimitero di Camnago Volta',
        city: 'Camnago Volta (Como)',
        country: 'IT',
        sources: [
            'https://it.wikipedia.org/wiki/Alessandro_Volta',
            'Comune di Como — Camnago Volta',
        ],
        sculpturalNotes:
            'Tempio neoclassico circolare a cupola, busto scultoreo in marmo di Giovanni Battista Comolli, rilievo raffigurante la pila voltaica.',
        coordinatesHint: 'Camnago Volta, Como',
        verified: true,
    },
    {
        id: 'manzoni-monumentale-milano',
        historicalFigure: 'Alessandro Manzoni',
        cemetery: 'Cimitero Monumentale di Milano',
        city: 'Milano',
        country: 'IT',
        sources: [
            'https://it.wikipedia.org/wiki/Cimitero_Monumentale_di_Milano',
            'Comune di Milano — Monumentale',
        ],
        sculpturalNotes:
            'Sepoltura nel Famedio / area monumentale del Cimitero Monumentale di Milano.',
        coordinatesHint: 'Piazzale Cimitero Monumentale, Milano',
        verified: true,
    },
    {
        id: 'goffredo-mameli-verana-roma',
        historicalFigure: 'Goffredo Mameli',
        cemetery: 'Cimitero del Verano',
        city: 'Roma',
        country: 'IT',
        sources: [
            'https://it.wikipedia.org/wiki/Cimitero_del_Verano',
            'https://it.wikipedia.org/wiki/Goffredo_Mameli',
        ],
        sculpturalNotes:
            'Sepoltura documentata al Verano; riprese solo su monumento/epigrafe esistenti.',
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
