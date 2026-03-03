import { getImagesFromFilesystem } from './getImages';

export interface Product {
    id: string;
    name: string;
    slug: string;
    price: number;
    description: string;
    shortDescription?: string;
    descriptionSEO?: string;
    isBouquet?: boolean;
    coverImage?: string | null;
    images?: string[];
    category?: 'cimitero' | 'funerale';
}

const productsRaw: Omit<Product, 'images'>[] = [
    {
        id: "c1",
        name: "Bouquet di Rose",
        slug: "bouquet-di-rose",
        price: 34.99,
        description: "Elegante bouquet di rose per un omaggio dolce e delicato.",
        isBouquet: true,
        category: 'cimitero',
        descriptionSEO: "Il Bouquet di Rose è un omaggio floreale elegante e senza tempo, pensato per esprimere affetto, vicinanza e rispetto nel ricordo di una persona cara.\nLa composizione include una selezione di 5 rose fresche, simbolo universale di amore eterno, purezza e memoria.\n\nOgni bouquet viene realizzato dal fiorista locale in base alla stagionalità e alla disponibilità nella zona di consegna, garantendo freschezza e armonia nella composizione.\n\nDopo la consegna riceverai una foto della tomba direttamente sul tuo WhatsApp e nel tuo profilo personale, come conferma del servizio.\n\nLe immagini hanno valore illustrativo: i fiori possono variare leggermente, ma il risultato finale manterrà lo stile e l’eleganza del bouquet scelto."
    },
    {
        id: "c2",
        name: "Lumino",
        slug: "lumino",
        price: 3.49,
        description: "Un semplice lumino per illuminare il ricordo.",
        category: 'cimitero',
        isBouquet: false
    },
    {
        id: "c3",
        name: "Messaggio",
        slug: "messaggio",
        price: 2.49,
        description: "Un biglietto con un messaggio personalizzato.",
        category: 'cimitero',
        isBouquet: false
    },
    {
        id: "f1",
        name: "Kalonche (pianta in vaso)",
        slug: "kalonche",
        price: 37.99,
        description: "Elegante pianta di Kalonche (Kalanchoe) per un ricordo duraturo e fiorito, adatta alla cerimonia funebre.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "La pianta di Kalonche è nota per la sua eleganza e semplicità. Un omaggio floreale resistente e duraturo ideale per le cerimonie funebri e le camere ardenti."
    },
    {
        id: "f2",
        name: "Margherite/Gerbere (pianta in vaso)",
        slug: "margherite-gerbere",
        price: 39.99,
        description: "Vaso con fresche e delicate Margherite o Gerbere.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "Composizione in vaso con fiori semplici ma profondamente affettuosi come le margherite e le gerbere. La loro purezza rappresenta un tributo sincero e addolcisce il momento del lutto."
    },
    {
        id: "f3",
        name: "Bouquet Rispetto e Vicinanza",
        slug: "bouquet-rispetto-vicinanza",
        price: 39.99,
        description: "Un pensiero delicato per esprimere profondo rispetto e vicinanza in momenti difficili.",
        isBouquet: true,
        category: 'funerale'
    },
    {
        id: "c4",
        name: "Ricordo Affettuoso",
        slug: "bouquet-ricordo-affettuoso",
        price: 29.99,
        description: "Un mazzo di fiori freschi per ricordare con affetto i propri cari.",
        isBouquet: true,
        category: 'cimitero',
        descriptionSEO: "Il Ricordo Affettuoso è un omaggio floreale delicato, pensato per esprimere affetto, vicinanza e rispetto nel ricordo di una persona cara.\n\nOgni bouquet viene realizzato dal fiorista locale in base alla stagionalità e alla disponibilità nella zona di consegna, garantendo freschezza e armonia."
    },
    {
        id: "c5",
        name: "Omaggio Speciale",
        slug: "bouquet-omaggio-speciale",
        price: 39.99,
        description: "Composizione floreale speciale, curata in ogni minimo dettaglio.",
        isBouquet: true,
        category: 'cimitero',
        descriptionSEO: "L'Omaggio Speciale è una composizione floreale curata in ogni minimo dettaglio, pensata per esprimere vicinanza e rispetto nel ricordo di una persona cara."
    },
    {
        id: "c6",
        name: "Tributo Eterno",
        slug: "bouquet-tributo-eterno",
        price: 49.99,
        description: "Un tributo eterno e maestoso per onorare una memoria preziosa.",
        isBouquet: true,
        category: 'cimitero',
        descriptionSEO: "Il Tributo Eterno è un omaggio floreale maestoso, pensato per onorare una memoria preziosa ed esprimere profondo rispetto e vicinanza."
    },
    {
        id: "b1",
        name: "Bouquet Cordoglio Sincero",
        slug: "bouquet-cordoglio-sincero",
        price: 49.99,
        description: "Un mazzo di fiori freschi per ricordare con affetto i propri cari.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "Il Bouquet Cordoglio Sincero è un omaggio floreale delicato, pensato per esprimere affetto, vicinanza e rispetto nel ricordo di una persona cara.\n\nOgni bouquet viene realizzato dal fiorista locale in base alla stagionalità e alla disponibilità nella zona di consegna, garantendo freschezza e armonia."
    },
    {
        id: "b2",
        name: "Bouquet Omaggio Solenne",
        slug: "bouquet-omaggio-solenne",
        price: 69.99,
        description: "Composizione floreale speciale, curata in ogni minimo dettaglio.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "L'Omaggio Solenne è una composizione floreale curata in ogni minimo dettaglio, pensata per esprimere vicinanza e rispetto nel ricordo di una persona cara."
    },
    {
        id: "b3",
        name: "Bouquet Memoria Eterna",
        slug: "bouquet-memoria-imperituri",
        price: 89.99,
        description: "Un tributo eterno e maestoso per onorare una memoria preziosa.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "Il Tributo Eterno è un omaggio floreale maestoso, pensato per onorare una memoria preziosa ed esprimere profondo rispetto e vicinanza."
    },
    {
        id: "f4",
        name: "Nastro commemorativo",
        slug: "nastro-commemorativo",
        price: 14.99,
        description: "Nastro in raso per un messaggio duraturo allegato alle composizioni.",
        isBouquet: false,
        category: 'funerale'
    },
    {
        id: "f5",
        name: "Set Ceri/Candele",
        slug: "set-ceri",
        price: 24.99,
        description: "Set di ceri o candele eleganti da accompagnare ai riti funebri.",
        isBouquet: false,
        category: 'funerale'
    },
    {
        id: "f6",
        name: "Cuscino",
        slug: "cuscino",
        price: 129.99,
        description: "Cuscino floreale adagiato, maestoso ed estremamente curato.",
        isBouquet: true,
        category: 'funerale'
    },
    {
        id: "f7",
        name: "Piramide",
        slug: "piramide",
        price: 139.99,
        description: "Composizione floreale imponente e verticale a forma di piramide.",
        isBouquet: true,
        category: 'funerale'
    },
    {
        id: "f8",
        name: "Copribara",
        slug: "copribara",
        price: 189.99,
        description: "Elegante stesura di fiori a copertura totale per la massima onorificenza.",
        isBouquet: true,
        category: 'funerale'
    },
    {
        id: "f9",
        name: "Cuore / Corona",
        slug: "cuore-corona",
        price: 199.99,
        description: "Tributo solenne di altissimo artigianato floreale lavorato a corona o cuore.",
        isBouquet: true,
        category: 'funerale'
    }
];

export const products: Product[] = productsRaw.map(p => {
    const imagesArray = getImagesFromFilesystem(p.slug) || [];
    return {
        ...p,
        images: imagesArray,
        coverImage: imagesArray.length > 0 ? imagesArray[0] : null
    };
});

export function getProductBySlug(slug: string): Product | undefined {
    return products.find((p) => p.slug === slug);
}
