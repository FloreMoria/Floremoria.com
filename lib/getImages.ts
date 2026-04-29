const pathMapping: Record<string, string> = {
    // OMAGGI FLOREALI (Cimitero -> Bouquet)
    "bouquet-ricordo-affettuoso": "images/products/fiori-sulle-tombe/Bouquet Ricordo Affettuoso",
    "bouquet-omaggio-speciale": "images/products/fiori-sulle-tombe/Bouquet Omaggio Speciale",
    "bouquet-tributo-eterno": "images/products/fiori-sulle-tombe/Bouquet Tributo Eterno",
    "bouquet-di-rose": "images/products/fiori-sulle-tombe/Bouquet Rose",
    "lumino": "images/products/accessori/lumino",
    "messaggio": "images/products/accessori/messaggio",

    // PER IL FUNERALE
    "bouquet-cordoglio-sincero": "images/products/Fiori per Funerale/bouquet-cordoglio-sincero",
    "bouquet-omaggio-solenne": "images/products/Fiori per Funerale/bouquet-omaggio-solenne",
    "bouquet-memoria-imperituri": "images/products/Fiori per Funerale/bouquet-memoria-eterna",
    "kalonche": "images/products/Fiori per Funerale/kalonche",
    "margherite-gerbere": "images/products/Fiori per Funerale/margherite-gerbere FF",
    "bouquet-rispetto-vicinanza": "images/products/Fiori per Funerale/bouquet-rispetto-vicinanza",
    "nastro-commemorativo": "images/products/accessori/Nastro commemorativo",
    "set-ceri": "images/products/accessori/set-ceri-candele",
    "cuscino": "images/products/Fiori per Funerale/cuscino",
    "piramide": "images/products/Fiori per Funerale/piramide",
    "copribara": "images/products/Fiori per Funerale/copribara",
    "cuore-corona": "images/products/Fiori per Funerale/cuore-corona"
};

export function getImagesFromFilesystem(slug: string): string[] {
    if (typeof window !== 'undefined') {
        return [];
    }

    const physicalPath = pathMapping[slug] || `images/products/${slug}`;
    let validFiles: string[] = [];

    try {
        // Nascondiamo il require al bundler Webpack per i Client Components
        const fs = eval('require("fs")');
        const path = eval('require("path")');

        const folderPath = path.join(process.cwd(), 'public', physicalPath);

        if (fs.existsSync(folderPath)) {
            const files = fs.readdirSync(folderPath);
            validFiles = files.filter((f: string) => {
                if (f.startsWith('.')) return false;
                const ext = path.extname(f).toLowerCase();
                return ['.webp', '.png', '.jpg', '.jpeg'].includes(ext);
            });
        }
    } catch (e) {
        // Fallback silenzioso se fs non è disponibile (es. runtime browser)
    }

    if (validFiles.length > 0) {
        // Ordina mettendo al primo posto l'immagine di copertina
        const sortedFiles = validFiles.sort((a: string, b: string) => {
            const aLow = a.toLowerCase();
            const bLow = b.toLowerCase();
            const aCover = aLow.includes('copertina') || aLow.includes('main') || aLow.startsWith('1.');
            const bCover = bLow.includes('copertina') || bLow.includes('main') || bLow.startsWith('1.');
            if (aCover && !bCover) return -1;
            if (!aCover && bCover) return 1;
            return a.localeCompare(b);
        });

        // Restituisce i primi 5 (1 cover + 4 gallery)
        return sortedFiles.slice(0, 5).map((f: string) => {
            // Encode the URL spaces because Next/Image requires proper URIs
            return encodeURI(`/${physicalPath}/${f}`);
        });
    } else {
        // Log richiesto per errore critico e debug strutturale
        console.error(`ERRORE CRITICO: Cartella /public/${physicalPath} non trovata o vuota (slug: ${slug})`);
        return [];
    }
}
