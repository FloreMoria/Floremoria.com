/**
 * Agente AI Pinterest — Generazione e pubblicazione quotidiana automatica (senza approvazione manuale).
 * Tono: sereno, profondo, luminoso — mai cupo (SOFIA + ALMA).
 */
import prisma from '@/lib/prisma';
import { createPin, type CreatePinResult } from '@/lib/social/pinterest';

export interface PinterestThemeConfig {
    id: string;
    name: string;
    description: string;
    /** Path o URL completo; se path relativo, verrà prefissato con floremoria.com. */
    defaultLink: string;
    titles: string[];
    descriptions: string[];
    hashtags: string[];
    images: string[];
}

const SITE_HOME = 'https://www.floremoria.com';

/**
 * Rotazione ciclica dei temi richiesti per la pubblicazione giornaliera automatica.
 * 1) Fiori tombe / cimitero
 * 2) Funerale / cordoglio
 * 3) Pet Memorial
 * 4) Piante in vaso / cura continuativa
 */
export const PINTEREST_THEMES: PinterestThemeConfig[] = [
    {
        id: 'TOMB_CEMETERY',
        name: 'Fiori sulle tombe / cimitero',
        description: 'Omaggi floreali per tombe e cimiteri, con conferma fotografica.',
        defaultLink: SITE_HOME,
        titles: [
            'Fiori freschi sulla tomba | Consegna al cimitero FloreMoria',
            'Un omaggio discreto al cimitero | Foto di conferma su WhatsApp',
            'Presenza affidata, memoria custodita | Fiori sulle tombe',
            'Consegna floreale al cimitero | Cura locale FloreMoria',
        ],
        descriptions: [
            'Un gesto di presenza quando non si può essere lì. Fioristi partner locali posano l’omaggio sulla tomba e inviamo la foto di conferma su WhatsApp.',
            'Fiori freschi, consegna al cimitero e serenità operativa: FloreMoria accompagna il ricordo con discrezione e trasparenza.',
            'Scopri il servizio di consegna floreale sulle tombe in Italia: cura botanica, partner locali e testimonianza fotografica della posa.',
        ],
        hashtags: [
            '#FioriSulleTombe',
            '#FloreMoria',
            '#ConsegnaCimitero',
            '#OmaggioFloreale',
            '#FotoDiConferma',
            '#RicordoSereno',
        ],
        images: [
            'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1507746309198-ac242370861e?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1561181286-d3fee7d55364?q=80&w=1200&auto=format&fit=crop',
        ],
    },
    {
        id: 'FUNERAL_CORDOGLIO',
        name: 'Funerale / cordoglio',
        description: 'Composizioni solenni per cerimonie e momenti di cordoglio.',
        defaultLink: SITE_HOME,
        titles: [
            'Omaggio di cordoglio | Composizioni per cerimonie FloreMoria',
            'Vicinanza discreta | Corone e composizioni funebri',
            'Un saluto luminoso | Fiori per funerali e cerimonie',
            'Eleganza e rispetto | Addobbi floreali FloreMoria',
        ],
        descriptions: [
            'Composizioni curate per cerimonie e momenti di cordoglio: presenza floreale sobria, puntuale e rispettosa della famiglia.',
            'Corone, cuscini e omaggi solenni realizzati da fioristi locali, con consegna al luogo della cerimonia o al cimitero.',
            'FloreMoria accompagna il commiato con fiori freschi e un tono quiet luxury: dignità, empatia, nessuna urgenza artificiale.',
        ],
        hashtags: [
            '#FioriFunerali',
            '#CerimoniaFunebre',
            '#OmaggioDiCordoglio',
            '#FloreMoria',
            '#AddobbiFunebri',
            '#VicinanzaDiscreta',
        ],
        images: [
            'https://images.unsplash.com/photo-1508615039623-a25605d2b022?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
        ],
    },
    {
        id: 'PET_MEMORIAL',
        name: 'Pet Memorial / animali domestici',
        description: 'Omaggio affettuoso e luminoso ai compagni a quattro zampe.',
        defaultLink: SITE_HOME,
        titles: [
            'Pet Memorial | Un ricordo luminoso per i nostri animali',
            'Amore fedele, sempre | Omaggio floreale Pet Memorial',
            'Per chi ha condiviso la casa e il cuore | FloreMoria Pet',
            'Un pensiero sereno | Fiori in memoria degli amici animali',
        ],
        descriptions: [
            'Un omaggio floreale per ricordare i compagni a quattro zampe con gratitudine e luce, senza toni cupi.',
            'Pet Memorial FloreMoria: un gesto semplice e affettuoso per onorare chi ha reso più calda ogni giornata.',
            'Ricordare con serenità. Scopri gli omaggi dedicati agli animali domestici su floremoria.com.',
        ],
        hashtags: [
            '#PetMemorial',
            '#AmiciAQuattroZampe',
            '#FloreMoria',
            '#RicordoPet',
            '#AmoreFedele',
            '#OmaggioSereno',
        ],
        images: [
            'https://images.unsplash.com/photo-1544568100-847a948585b9?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1534361960057-19889db9621e?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
        ],
    },
    {
        id: 'PLANTS_ONGOING_CARE',
        name: 'Piante in vaso / cura continuativa',
        description: 'Piante e cura nel tempo: presenza vegetale duratura e ricorrenze.',
        defaultLink: SITE_HOME,
        titles: [
            'Piante in vaso per la memoria | Cura che resta nel tempo',
            'Una presenza verde e continua | FloreMoria piante commemorative',
            'Cura continuativa del ricordo | Piante e ricorrenze',
            'Verde sereno sulla tomba | Piante in vaso FloreMoria',
        ],
        descriptions: [
            'Le piante in vaso offrono una presenza più duratura: cura botanica, consegna al cimitero e aggiornamenti fotografici quando previsti.',
            'Per chi desidera un gesto che resta nel tempo. FloreMoria propone piante commemorative e percorsi di cura continuativa.',
            'Serenità operativa e memoria viva: scopri piante in vaso e servizi di ricorrenza su floremoria.com.',
        ],
        hashtags: [
            '#PianteInVaso',
            '#CuraContinuativa',
            '#FloreMoria',
            '#MemoriaVerde',
            '#PianteCommemorative',
            '#Ricorrenze',
        ],
        images: [
            'https://images.unsplash.com/photo-1485955900006-10f4d324d411?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1459411552884-841db9b3aa2f?q=80&w=1200&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?q=80&w=1200&auto=format&fit=crop',
        ],
    },
];

const THEME_INDEX_STATE_KEY = 'pinterest_last_theme_index';
const LAST_DAILY_PIN_KEY = 'pinterest_last_daily_pin_at';
const LAST_DAILY_PIN_META_KEY = 'pinterest_last_daily_pin_meta';

export interface GenerateDailyPinResult {
    success: boolean;
    simulated?: boolean;
    skipped?: boolean;
    themeId: string;
    themeName: string;
    title: string;
    description: string;
    link: string;
    imageUrl: string;
    pinId?: string;
    error?: string;
}

function europeRomeDayKey(d = new Date()): string {
    // Chiave giorno Europe/Rome per idempotenza cron (no doppio Pin nello stesso giorno).
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

/**
 * Genera e pubblica il Pin quotidiano in automatico (nessuna approvazione umana).
 */
export async function generateDailyPinterestPin(options?: {
    force?: boolean;
}): Promise<GenerateDailyPinResult> {
    const dayKey = europeRomeDayKey();

    if (!options?.force) {
        try {
            const lastAt = await prisma.systemState.findUnique({
                where: { key: LAST_DAILY_PIN_KEY },
            });
            if (lastAt?.value) {
                const lastDay = europeRomeDayKey(new Date(lastAt.value));
                if (lastDay === dayKey) {
                    const meta = await prisma.systemState.findUnique({
                        where: { key: LAST_DAILY_PIN_META_KEY },
                    });
                    let parsed: Partial<GenerateDailyPinResult> = {};
                    try {
                        parsed = meta?.value ? (JSON.parse(meta.value) as Partial<GenerateDailyPinResult>) : {};
                    } catch {
                        parsed = {};
                    }
                    console.info(
                        `[Pinterest Agent] Skip: Pin già pubblicato oggi (${dayKey}) — pinId=${parsed.pinId || 'n/a'}`
                    );
                    return {
                        success: true,
                        skipped: true,
                        simulated: Boolean(parsed.simulated),
                        themeId: String(parsed.themeId || 'SKIP'),
                        themeName: String(parsed.themeName || 'già pubblicato oggi'),
                        title: String(parsed.title || ''),
                        description: String(parsed.description || ''),
                        link: String(parsed.link || SITE_HOME),
                        imageUrl: String(parsed.imageUrl || ''),
                        pinId: parsed.pinId ? String(parsed.pinId) : undefined,
                    };
                }
            }
        } catch (e) {
            console.warn('[Pinterest Agent] Check idempotenza giornaliera non riuscito:', e);
        }
    }

    // 1. Indice rotazione ciclica (0..N-1)
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

    // 2. Varianti contenuto (deterministiche per giorno)
    const variantSeed = Math.floor(Date.now() / (24 * 3600 * 1000));
    const title = theme.titles[variantSeed % theme.titles.length]!;
    const baseDesc = theme.descriptions[variantSeed % theme.descriptions.length]!;
    const imageUrl = theme.images[variantSeed % theme.images.length]!;
    const link = SITE_HOME;
    const hashtagLine = theme.hashtags.join(' ');
    const description = `${baseDesc}\n\n${hashtagLine}\n\n${SITE_HOME}`;

    console.log(
        `[Pinterest Agent] Pubblicazione automatica Pin — tema=${theme.name} (${theme.id}) day=${dayKey}`
    );

    // 3. Chiamata diretta API Pinterest v5 (board da env PINTEREST_BOARD_ID)
    const publishResult: CreatePinResult = await createPin({
        title,
        description,
        link,
        imageUrl,
        altText: title,
    });

    if (!publishResult.success) {
        console.error(
            `[Pinterest Agent] Errore pubblicazione Pin per tema ${theme.id}:`,
            publishResult.error
        );
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

    const result: GenerateDailyPinResult = {
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

    // 4. Persisti rotazione + meta ultimo Pin (log operativo)
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
            prisma.systemState.upsert({
                where: { key: LAST_DAILY_PIN_META_KEY },
                update: { value: JSON.stringify(result) },
                create: { key: LAST_DAILY_PIN_META_KEY, value: JSON.stringify(result) },
            }),
        ]);
    } catch (e) {
        console.warn('[Pinterest Agent] Impossibile aggiornare SystemState per tema Pinterest:', e);
    }

    console.info(
        `[Pinterest Agent] OK pinId=${result.pinId || 'n/a'} simulated=${Boolean(result.simulated)} theme=${result.themeId}`
    );

    return result;
}
