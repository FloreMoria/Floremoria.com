/**
 * MOMO storyteller — script 9:16 (12–25s) su footage reale con 3 format narrativi
 * ed esclusiva regola anti-spoiler nelle didascalie social.
 */
import {
    getMonumentById,
    type MonumentRecord,
} from '@/lib/ai/momo/momoMonuments';

export type MomoNarrativeFormat =
    | 'luogo_sospeso'
    | 'scintilla_silenzio'
    | 'cura_memoria';

export type MomoFormatDescriptor = {
    id: MomoNarrativeFormat;
    label: string;
    focus: string;
    mood: string;
    defaultDuration: number;
};

export const MOMO_NARRATIVE_FORMATS: MomoFormatDescriptor[] = [
    {
        id: 'luogo_sospeso',
        label: 'Format 1 · Il Luogo Sospeso',
        focus: 'Visione, paesaggio mozzafiato, luce e architettura',
        mood: 'Meraviglia, contemplazione, rispetto per la bellezza',
        defaultDuration: 15,
    },
    {
        id: 'scintilla_silenzio',
        label: 'Format 2 · La Scintilla nel Silenzio',
        focus: 'Personaggio storico, mistero intimo, curiosità ed enigma',
        mood: 'Mistero solenne, alto tempo di permanenza (watch-time)',
        defaultDuration: 18,
    },
    {
        id: 'cura_memoria',
        label: 'Format 3 · La Cura della Memoria',
        focus: 'Gesto floreale, essenze botaniche (Martina), valore del ricordo',
        mood: 'Sobrietà botanica, delicatezza, continuità del ricordo',
        defaultDuration: 15,
    },
];

export type MomoScriptBlock = {
    startSec: number;
    endSec: number;
    label: 'hook' | 'footage' | 'reveal' | 'closing';
    narration?: string;
    /** Direzione inquadratura footage reale. */
    visualDirection: string;
};

export type MomoScript = {
    monumentId: string;
    formatId: MomoNarrativeFormat;
    formatLabel: string;
    historicalFigure: string;
    cemetery: string;
    durationSeconds: number;
    hookQuestion: string;
    instagramTag: string;
    blocks: MomoScriptBlock[];
    fullNarration: string;
    hashtags: string[];
    title: string;
    /** Didascalia completa per Instagram/TikTok con prima riga anti-spoiler e soluzione in coda. */
    description: string;
    firstLineHook: string;
    solutionFooter: string;
};

export type MomoLocationInput = {
    id: string;
    cemetery: string;
    city: string;
    historicalFigure: string;
    visionLandscape: string;
    floralNotes?: string;
    sources?: string[];
};

export function buildMomoScript(
    monumentOrLocation: string | MomoLocationInput,
    formatId: MomoNarrativeFormat = 'luogo_sospeso',
    customDuration?: number
): MomoScript {
    let m: MonumentRecord;
    if (typeof monumentOrLocation === 'string') {
        const found = getMonumentById(monumentOrLocation);
        if (found) {
            m = found;
        } else {
            m = {
                id: monumentOrLocation,
                cemetery: monumentOrLocation,
                city: 'Italia',
                country: 'IT',
                historicalFigure: 'Figure illustri della memoria storica',
                visionLandscape: `La visione solenne e la bellezza silenziosa di ${monumentOrLocation}.`,
                sculpturalNotes: 'Architettura monumentale e memoria storica.',
                floralNotes: 'Composizione sobria di alloro, rose discrete ed edera perenne.',
                sources: ['Archivi storici di pubblico dominio'],
                verified: true,
            };
        }
    } else {
        m = {
            id: monumentOrLocation.id,
            cemetery: monumentOrLocation.cemetery,
            city: monumentOrLocation.city,
            country: 'IT',
            historicalFigure: monumentOrLocation.historicalFigure,
            visionLandscape: monumentOrLocation.visionLandscape,
            sculpturalNotes: 'Architettura monumentale e memoria storica.',
            floralNotes:
                monumentOrLocation.floralNotes ||
                'Composizione sobria di alloro, rose discrete ed edera perenne.',
            sources: monumentOrLocation.sources || [
                'Archivi storici di pubblico dominio',
            ],
            verified: true,
        };
    }

    const formatMeta =
        MOMO_NARRATIVE_FORMATS.find((f) => f.id === formatId) ||
        MOMO_NARRATIVE_FORMATS[0];
    const duration = customDuration || formatMeta.defaultDuration;

    return composeScript(m, formatMeta, duration);
}

function composeScript(
    m: MonumentRecord,
    format: MomoFormatDescriptor,
    durationSeconds: number
): MomoScript {
    let hookQuestion: string;
    let title: string;
    let firstLineHook: string;
    let bodyReflection: string;
    let visualDirection: string;

    const isLakeOrSea =
        m.id === 'alessandro-volta-camnago' ||
        m.id === 'san-fruttuoso-costieri-liguria';

    switch (format.id) {
        case 'luogo_sospeso': {
            hookQuestion = isLakeOrSea
                ? 'Sapete dove si trova questo cimitero affacciato sull\'acqua?'
                : 'Ci sono luoghi dove la bellezza del paesaggio incontra la pace eterna.';
            title = 'Un luogo sospeso nella bellezza | FloreMoria';
            firstLineHook =
                'Riconosci questo scorcio silenzioso? Scrivi nei commenti dove ci troviamo prima della fine del video 🌿';
            bodyReflection =
                `Tra la luce che filtra naturale e il respiro del paesaggio, questi sentieri custodiscono un\'armonia che va oltre il tempo.\n\n${m.visionLandscape}`;
            visualDirection =
                'Footage reale dal vivo / Ken Burns: panoramica fluida su orizzonte naturale, contrasto luci-ombre e architettura monumentale.';
            break;
        }

        case 'scintilla_silenzio': {
            hookQuestion =
                'In questo angolo appartato riposa chi ha cambiato per sempre la nostra storia.';
            title = 'La scintilla nel silenzio: chi riposa qui? | FloreMoria';
            firstLineHook =
                'C\'è un filo invisibile che unisce il silenzio di questo luogo alla nostra storia quotidiana. Tu sapresti indovinare chi riposa qui? 💬';
            bodyReflection =
                `Nessun rumore, solo la dignità della memoria per chi ha lasciato un\'impronta indelebile.\n\n${m.visionLandscape}`;
            visualDirection =
                'Footage reale POV dal vivo / Ken Burns: passo lento verso il monumento, mantenendo l\'inquadratura sull\'insieme scultoreo senza svelare subito il nome.';
            break;
        }

        case 'cura_memoria': {
            hookQuestion = 'Un fiore per non dimenticare, anche a distanza di secoli.';
            title = 'La cura della memoria e il linguaggio dei fiori | FloreMoria';
            firstLineHook =
                'Un gesto di presenza che attraversa il tempo. Qual è il fiore che sceglieresti per questo luogo? 🌸';
            bodyReflection =
                `La cura del ricordo vive nei piccoli dettagli: ${m.floralNotes || 'composizioni discrete posate con grazia e rispetto'}.\n\n${m.visionLandscape}`;
            visualDirection =
                'Footage reale POV / Ken Burns: close-up elegante sulla pietra e sui dettagli botanici con sfocato naturale sul monumento.';
            break;
        }
    }

    // Regola Anti-Spoiler: la soluzione dettagliata va in coda dopo divisorio
    const solutionFooter = [
        '---',
        `📍 Luogo: ${m.cemetery} (${m.city})`,
        `🌿 Memoria custodita: ${m.historicalFigure}`,
        m.floralNotes ? `🌸 Omaggio botanico: ${m.floralNotes}` : '',
        '✨ Servizio di testimonianza e cura della memoria: @app_floremoria',
        'Soluzione nei commenti fissati ⬇️',
    ]
        .filter(Boolean)
        .join('\n');

    const description = `${firstLineHook}\n\n${bodyReflection}\n\n${solutionFooter}`;

    const hashtags = [
        '#FloreMoria',
        '#ReelsItalia',
        '#LuoghiDellaMemoria',
        '#CimiteriMonumentali',
        '#BellezzaItaliana',
        '#Storia',
        '#QuietLuxury',
    ];

    const blocks: MomoScriptBlock[] = [
        {
            startSec: 0,
            endSec: durationSeconds,
            label: 'footage',
            visualDirection,
        },
    ];

    return {
        monumentId: m.id,
        formatId: format.id,
        formatLabel: format.label,
        historicalFigure: m.historicalFigure,
        cemetery: m.cemetery,
        durationSeconds,
        hookQuestion,
        instagramTag: '@APP_FLOREMORIA',
        blocks,
        fullNarration: '',
        hashtags,
        title,
        description,
        firstLineHook,
        solutionFooter,
    };
}
