/**
 * Agente AI Pinterest — Generazione e pubblicazione quotidiana con rotazione tematica.
 * Tono di Voce: gioioso, sereno, profondo e liturgico, leggero e mai cupo.
 */
import prisma from '@/lib/prisma';
import { createPin, type CreatePinResult } from '@/lib/social/pinterest';

export interface PinterestThemeConfig {
    id: string;
    name: string;
    description: string;
    defaultLink: string;
    titles: string[];
    descriptions: string[];
    hashtags: string[];
    images: string[];
}

export const PINTEREST_THEMES: PinterestThemeConfig[] = [
    {
        id: 'REMEMBRANCE_PEOPLE',
        name: 'Persone e ricordi affettuosi',
        description: 'Pezzi dedicati al ricordo affettuoso dei cari con delicatezza e luce.',
        defaultLink: 'https://www.floremoria.com/fiori-per-defunti',
        titles: [
            'Ricordi che Scaldano il Cuore | Omaggio Floreale ai Nostri Cari 🌹',
            'Un Fiore per Non Dimenticare | Consegna Cimitero FloreMoria',
            'Nel Ricordo dei Nostri Cari | Eleganza e Devozione Floreale',
            'Luce e Amore che Restano | Omaggio Floreale Personalizzato',
        ],
        descriptions: [
            'Ogni fiore posato è un ponte d’amore verso chi continua a vivere nei nostri ricordi più cari. Con FloreMoria la cura del ricordo è semplice, serena e sempre confermata con foto in tempo reale.',
            'Un gesto di affetto profondo che attraversa il tempo. Scegli le composizioni floreali dedicate al ricordo dei tuoi cari con consegna gratuita al cimitero.',
            'Custodire la memoria con bellezza e serenità. I nostri fioristi partner locali confezionano ogni omaggio con profonda dedizione liturgica e cura dei dettagli.',
        ],
        hashtags: ['#RicordoEterno', '#FloreMoria', '#FioriPerDefunti', '#InMemoria', '#PensieroAffettuoso', '#AmoreInfinito'],
        images: [
            'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1508615039623-a25605d2b022?q=80&w=1200&auto=format&fit=crop',
        ],
    },
    {
        id: 'FLORAL_BOTANICAL',
        name: 'Solo composizioni floreali e botanica',
        description: 'Focus sulla bellezza delle specie botaniche, composizioni e cura floreale.',
        defaultLink: 'https://www.floremoria.com/catalogo',
        titles: [
            'L’Eleganza del Cuore | Composizioni Floreali e Botanica Sacra 🌿',
            'Fiori Freschi e Piante Commemorative | Arte Floreale FloreMoria',
            'Armonia Botanica per la Memoria | Composizioni d’Autore',
            'Fiori che Parlano d’Amore | Selezione Botanica FloreMoria',
        ],
        descriptions: [
            'Rose, gigli e piante sempreverdi selezionate con cura dai migliori fioristi locali per portare freschezza, colore ed armonia solenne.',
            'L’arte floreale al servizio del ricordo: composizioni create con fiori di altissima qualità, pensate per durare ed esprimere gratitudine serena.',
            'Scopri la nostra collezione botanica di omaggi floreali per cimitero. Dettagli curati con stile ed eleganza per ogni ricorrenza.',
        ],
        hashtags: ['#ArteFloreale', '#ComposizioniFloreali', '#FioriFreschi', '#BotanicaSacra', '#FloreMoria', '#FioriCimitero'],
        images: [
            'https://images.unsplash.com/photo-1561181286-d3fee7d55364?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1490750967868-88aa4486c946?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?q=80&w=1200&auto=format&fit=crop',
        ],
    },
    {
        id: 'FUNERAL_CEREMONIES',
        name: 'Funerali e cerimonie',
        description: 'Addobbi e presenze floreali solenni per cerimonie e momenti del commiato.',
        defaultLink: 'https://www.floremoria.com/cerimonie-funebri',
        titles: [
            'Omaggio ai Cari | Addobbi Floreali per Cerimonie Funebri 🕊️',
            'Vicinanza Solenne | Corone e Cuscini Floreali FloreMoria',
            'Un Ultimo Saluto di Luce | Omaggi per Cerimonie e Commiati',
            'Eleganza Liturgica e Rispetto | Fiori per Funerali',
        ],
        descriptions: [
            'Garantisci una presenza decorosa e solenne nelle cerimonie di commiato. Consegna puntuale direttamente al luogo della cerimonia o al cimitero.',
            'Corone, cuscini e copricassa realizzati con maestria ed empatia per manifestare vicinanza sincera nel rispetto della tradizione.',
            'Servizio professionale di consegna fiori per cerimonie funebri in tutta Italia con conferma fotografica della composizione.',
        ],
        hashtags: ['#CerimoniaFunebre', '#AddobbiFunebri', '#FioriFunerali', '#OmaggioSolenne', '#FloreMoria', '#Vicinanza'],
        images: [
            'https://images.unsplash.com/photo-1508615039623-a25605d2b022?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
        ],
    },
    {
        id: 'GRAVE_CARE',
        name: 'Cura della tomba al cimitero',
        description: 'Servizio di consegna continua, decoro della tomba e rassicurazione fotografica.',
        defaultLink: 'https://www.floremoria.com/abbonamento',
        titles: [
            'Una Presenza Costante | Consegna e Cura della Tomba al Cimitero 🌸',
            'La Tomba Sempre Fiorita | Abbonamento Ricorrenze FloreMoria',
            'Trasparenza e Serenità | Foto di Conferma Posa su WhatsApp',
            'Mantieni Vivo il Ricordo | Omaggi Floreali Periodici',
        ],
        descriptions: [
            'Anche a distanza, la tomba dei tuoi cari resta sempre curata e fiorita. Ricevi la fotografia del fiore posato direttamente su WhatsApp.',
            'Servizio di abbonamento e ricorrenze speciali: consegniamo fiori freschi nelle date per te importanti con la massima precisione e delicatezza.',
            'Zero pensieri, totale serenità. Con FloreMoria la memoria dei tuoi affetti è custodita giorno dopo giorno da fioristi locali di fiducia.',
        ],
        hashtags: ['#CuraDellaTomba', '#ServizioCimitero', '#AbbonamentoFloreale', '#FotoPosa', '#FloreMoria', '#PresenzaCostante'],
        images: [
            'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1507746309198-ac242370861e?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1561181286-d3fee7d55364?q=80&w=1200&auto=format&fit=crop',
        ],
    },
    {
        id: 'PET_MEMORIAL',
        name: 'Memorial per animali domestici (Pet Memorial)',
        description: 'Omaggio affettuoso e solare ai piccoli amici a quattro zampe.',
        defaultLink: 'https://www.floremoria.com/pet-memorial',
        titles: [
            'Un Amore Indimenticabile | Pet Memorial FloreMoria 🐾🌹',
            'Per Sempre nel Cuore | Omaggi Floreali Amici a Quattro Zampe',
            'Ponte dell’Arcobaleno | Ricordo Indelebile per i Nostri Animali',
            'Gratitudine Infinta | Fiori e Ricordi per Cani e Gatti',
        ],
        descriptions: [
            'I nostri amici a quattro zampe donano un amore puro che resta per sempre. Dedica loro un omaggio floreale luminoso ed affettuoso.',
            'Un pensiero speciale per ricordare i compagni di vita più fedeli. Con FloreMoria portiamo la carezza dei fiori nel loro luogo di riposo.',
            'Ricordare con gioia e gratitudine i momenti felici trascorsi insieme. Scopri la nostra linea dedicata al Pet Memorial.',
        ],
        hashtags: ['#PetMemorial', '#AmiciAQuattroZampe', '#PonteDellArcobaleno', '#FloreMoria', '#RicordoPet', '#AmorePuro'],
        images: [
            'https://images.unsplash.com/photo-1544568100-847a948585b9?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1534361960057-19889db9621e?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
        ],
    },
];

const THEME_INDEX_STATE_KEY = 'pinterest_last_theme_index';
const LAST_DAILY_PIN_KEY = 'pinterest_last_daily_pin_at';

export interface GenerateDailyPinResult {
    success: boolean;
    simulated?: boolean;
    themeId: string;
    themeName: string;
    title: string;
    description: string;
    link: string;
    imageUrl: string;
    pinId?: string;
    error?: string;
}

/**
 * Genera e pubblica il Pin quotidiano seguendo la rotazione ciclica dei 5 temi.
 */
export async function generateDailyPinterestPin(): Promise<GenerateDailyPinResult> {
    // 1. Recupera o calcola l'indice del tema nella rotazione ciclica (0..4)
    let themeIndex = 0;
    try {
        const lastState = await prisma.systemState.findUnique({
            where: { key: THEME_INDEX_STATE_KEY },
        });
        if (lastState?.value) {
            const parsed = parseInt(lastState.value, 10);
            if (Number.isFinite(parsed) && parsed >= 0) {
                themeIndex = (parsed + 1) % PINTEREST_THEMES.length;
            }
        }
    } catch (e) {
        console.warn('[Pinterest Agent] Fallback calcolo indice da data:', e);
        const dayOfYear = Math.floor(Date.now() / (24 * 3600 * 1000));
        themeIndex = dayOfYear % PINTEREST_THEMES.length;
    }

    const theme = PINTEREST_THEMES[themeIndex] || PINTEREST_THEMES[0]!;

    // 2. Seleziona varianti di contenuto in base a giorno/random deterministico
    const variantSeed = Math.floor(Date.now() / (24 * 3600 * 1000));
    const title = theme.titles[variantSeed % theme.titles.length]!;
    const baseDesc = theme.descriptions[variantSeed % theme.descriptions.length]!;
    const imageUrl = theme.images[variantSeed % theme.images.length]!;
    const link = theme.defaultLink;
    const hashtagLine = theme.hashtags.join(' ');
    const description = `${baseDesc}\n\n${hashtagLine}`;

    console.log(`[Pinterest Agent] Generazione Pin quotidiano — Tema: ${theme.name} (${theme.id})`);

    // 3. Invia il Pin su Pinterest API v5 tramite client createPin (con refresh 24h automatico)
    const publishResult: CreatePinResult = await createPin({
        title,
        description,
        link,
        imageUrl,
        altText: title,
    });

    if (!publishResult.success) {
        console.error(`[Pinterest Agent] Errore pubblicazione Pin per tema ${theme.id}:`, publishResult.error);
        return {
            success: false,
            themeId: theme.id,
            themeName: theme.name,
            title,
            description,
            link,
            imageUrl,
            error: publishResult.error || 'Creazione Pin fallita',
        };
    }

    // 4. Aggiorna l'indice per la rotazione del giorno successivo
    try {
        await Promise.all([
            prisma.systemState.upsert({
                where: { key: THEME_INDEX_STATE_KEY },
                update: { value: String(themeIndex) },
                create: { key: THEME_INDEX_STATE_KEY, value: String(themeIndex) },
            }),
            prisma.systemState.upsert({
                where: { key: LAST_DAILY_PIN_KEY },
                update: { value: new Date().toISOString() },
                create: { key: LAST_DAILY_PIN_KEY, value: new Date().toISOString() },
            }),
        ]);
    } catch (e) {
        console.warn('[Pinterest Agent] Impossibile aggiornare SystemState per tema Pinterest:', e);
    }

    return {
        success: true,
        simulated: publishResult.simulated ?? false,
        themeId: theme.id,
        themeName: theme.name,
        title,
        description,
        link,
        imageUrl,
        pinId: publishResult.pinId,
    };
}
