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
        description: "Pianta fiorita per un omaggio curato dai fioristi locali.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "Resistenza, colore e sobrietà. Una pianta fiorita pensata per un omaggio che resti nel tempo, curata dai fioristi locali per garantire vigore e bellezza. Verifica fotografica della consegna su WhatsApp."
    },
    {
        id: "f2",
        name: "Margherite/Gerbere (pianta in vaso)",
        slug: "margherite-gerbere",
        price: 39.99,
        description: "Un omaggio duraturo e luminoso, simbolo di purezza e semplicità.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "La vita che continua nel ricordo attraverso una pianta curata. Un omaggio duraturo e luminoso, simbolo di purezza e semplicità. Ideale per una presenza costante nel luogo del ricordo. Foto della posa inclusa."
    },
    {
        id: "f3",
        name: "Bouquet Rispetto e Vicinanza",
        slug: "bouquet-rispetto-vicinanza",
        price: 39.99,
        description: "Omaggio essenziale e composto per un saluto discreto.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "Omaggio essenziale e composto per un saluto discreto. Fiori freschi di stagione scelti per la loro sobrietà ed eleganza naturale. Un gesto autentico di memoria con foto della consegna su WhatsApp."
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
        id: "FT-001",
        name: "Omaggio Speciale",
        slug: "bouquet-omaggio-speciale",
        price: 39.99,
        description: "Composizione floreale speciale, curata in ogni minimo dettaglio.",
        isBouquet: true,
        category: 'cimitero',
        descriptionSEO: "L'Omaggio Speciale è una composizione floreale curata in ogni minimo dettaglio, pensata per esprimere vicinanza e rispetto nel ricordo di una persona cara.",
        coverImage: "/images/products/fiori-sulle-tombe/bouquet-omaggio-speciale/bouquet-omaggio-speciale-fiori-sulle-tombe-servizio-professionale-FT.webp"
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
        description: "Un bouquet delicato e fresco, perfetto per trasmettere vicinanza sincera.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "La forza della semplicità in un pensiero che parla al cuore. Un bouquet delicato e fresco, perfetto per trasmettere vicinanza sincera alla famiglia nel momento del lutto. Conferma fotografica via WhatsApp."
    },
    {
        id: "b2",
        name: "Bouquet Omaggio Solenne",
        slug: "bouquet-omaggio-solenne",
        price: 69.99,
        description: "Sobrietà e distinzione in un bouquet di alta qualità.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "Sobrietà e distinzione in un bouquet di alta qualità. Fiori stagionali selezionati per un saluto dignitoso e composto. La scelta ideale per esprimere stima e rispetto. Foto della consegna inclusa su WhatsApp."
    },
    {
        id: "b3",
        name: "Bouquet Memoria Eterna",
        slug: "bouquet-memoria-imperituri",
        price: 89.99,
        description: "Fiori nobili scelti per un ricordo che sfida il tempo.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "Fiori nobili scelti per un ricordo che sfida il tempo. Una composizione ricca ed elegante, pensata per un tributo di alto profilo. Artigianalità locale e freschezza garantita con verifica fotografica su smartphone."
    },
    {
        id: "f4",
        name: "Nastro commemorativo",
        slug: "nastro-commemorativo",
        price: 14.99,
        description: "Il tuo ultimo messaggio impresso con eleganza su nastro.",
        isBouquet: false,
        category: 'funerale',
        descriptionSEO: "Il tuo ultimo messaggio impresso con eleganza. Un nastro personalizzato con scritte artigianali per rendere unico il tuo tributo. Un dettaglio di valore che completa ogni omaggio floreale con dignità e rispetto."
    },
    {
        id: "f5",
        name: "Set Ceri/Candele",
        slug: "set-ceri",
        price: 24.99,
        description: "Una luce delicata che accompagna il ricordo.",
        isBouquet: false,
        category: 'funerale',
        descriptionSEO: "Una luce delicata che accompagna il ricordo. Set di ceri sobri, ideali per creare un'atmosfera di pace, preghiera e silenzio. Un complemento essenziale consegnato con cura e conferma del servizio garantita."
    },
    {
        id: "f6",
        name: "Cuscino",
        slug: "cuscino",
        price: 129.99,
        description: "Un omaggio classico e rassicurante che esprime dolcezza e vicinanza.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "Un omaggio classico e rassicurante che esprime dolcezza e vicinanza. Questa composizione distesa, dall'armonia cromatica curata, è ideale per un messaggio di profondo cordoglio. Foto della posa inviata via WhatsApp."
    },
    {
        id: "f7",
        name: "Piramide",
        slug: "piramide",
        price: 139.99,
        description: "Composizione solenne a sviluppo verticale, simbolo di elevazione e rispetto.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "Composizione solenne a sviluppo verticale, simbolo di elevazione e rispetto. Un equilibrio perfetto di forme e colori stagionali curato da mani esperte. Un omaggio di forte impatto visivo con verifica fotografica garantita."
    },
    {
        id: "f8",
        name: "Copribara",
        slug: "copribara",
        price: 189.99,
        description: "Eleganza e solennità per l'ultimo saluto con una copertura floreale completa.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "Eleganza e solennità per l'ultimo saluto. Una copertura floreale completa, composta con fiori freschi selezionati per dignità e bellezza. Creata artigianalmente per onorare il feretro. Conferma fotografica via WhatsApp inclusa."
    },
    {
        id: "f9",
        name: "Cuore / Corona",
        slug: "cuore-corona",
        price: 199.99,
        description: "Il massimo tributo di affetto e onore. Una composizione prestigiosa simbolo di amore infinito.",
        isBouquet: true,
        category: 'funerale',
        descriptionSEO: "Il massimo tributo di affetto e onore. Una composizione prestigiosa simbolo di amore infinito, realizzata con fiori d'eccellenza dai nostri fioristi locali. Riceverai la foto della consegna direttamente su WhatsApp come garanzia del servizio."
    }
];

export const products: Product[] = productsRaw.map(p => {
    const imagesArray = getImagesFromFilesystem(p.slug) || [];
    return {
        ...p,
        images: imagesArray,
        coverImage: p.coverImage || (imagesArray.length > 0 ? imagesArray[0] : null)
    };
});

export function getProductBySlug(slug: string): Product | undefined {
    return products.find((p) => p.slug === slug);
}
