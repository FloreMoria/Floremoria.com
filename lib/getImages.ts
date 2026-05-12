import manifest from '../public/images-manifest.json';

const pathMapping: Record<string, string> = {
    // Mappatura per compatibilità con vecchi slug o cartelle rinominate
    "bouquet-ricordo-affettuoso": "Bouquet Ricordo Affettuoso",
    "bouquet-omaggio-speciale": "Bouquet Omaggio Speciale",
    "bouquet-tributo-eterno": "Bouquet Tributo Eterno",
    "bouquet-di-rose": "Bouquet Rose",
    "lumino": "lumino",
    "messaggio": "messaggio",
    "foto-stato-prima-consegna": "messaggio",
    "bouquet-cordoglio-sincero": "bouquet-cordoglio-sincero",
    "bouquet-omaggio-solenne": "bouquet-omaggio-solenne",
    "bouquet-memoria-imperituri": "bouquet-memoria-eterna",
    "kalonche": "kalonche",
    "margherite-gerbere": "margherite-gerbere FF",
    "bouquet-rispetto-vicinanza": "bouquet-rispetto-vicinanza",
    "nastro-commemorativo": "Nastro commemorativo",
    "set-ceri": "set-ceri-candele",
    "cuscino": "cuscino",
    "piramide": "piramide",
    "copribara": "copribara",
    "cuore-corona": "cuore-corona",
    "un-raggio-di-sole": "Un raggio di sole",
    "abbraccio-verde": "Abbraccio Verde",
    "legame-eterno": "Legame eterno",
    "battito-di-foglia": "Battito di Foglia",
    "anima-pura": "Anima Pura",
    "il-giardino-del-ponte": "Il Giardino del Ponte",
    "lumino-piccoli-amici": "Lumino Piccoli Amici",
    "biglietto-piccoli-amici": "Biglietto Piccoli Amici",
    "ceri-piccoli-amici": "Ceri Piccoli Amici",
    "nastro-commemorativo-piccoli-amici": "Nastro Commemorativo Piccoli Amici"
};

export function getImagesFromFilesystem(slug: string): string[] {
    // 1. Tenta di recuperare le immagini dal Manifest generato a build-time
    // Usiamo il pathMapping se presente, altrimenti lo slug diretto
    const folderKey = pathMapping[slug] || slug;
    const entry = (manifest as any)[folderKey];

    if (entry && entry.images && entry.images.length > 0) {
        // Restituisce i primi 5 (già ordinati e codificati dal manifest-script)
        return entry.images.slice(0, 5);
    }

    // 2. Se non trova nulla nel manifest, logghiamo l'errore per debug
    if (typeof window === 'undefined') {
        console.warn(`[getImages] Nessuna immagine trovata nel manifest per folderKey: ${folderKey} (slug: ${slug})`);
    }

    return [];
}

