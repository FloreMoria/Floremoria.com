/**
 * MOMO storyteller — script 9:16 (45–60s) solo su dati monumentali certificati.
 * Vincoli: zero tombe inventate; solo gesti mani/dettaglio per composizioni floreali.
 */
import {
    assertMonumentCertified,
    type MonumentRecord,
} from '@/lib/ai/momo/momoMonuments';

export type MomoScriptBlock = {
    startSec: number;
    endSec: number;
    label: 'hook' | 'monument' | 'legacy' | 'closing';
    narration: string;
    /** Direzione inquadratura: mai corpo intero. */
    visualDirection: string;
};

export type MomoScript = {
    monumentId: string;
    historicalFigure: string;
    cemetery: string;
    durationSeconds: number;
    blocks: MomoScriptBlock[];
    fullNarration: string;
    hashtags: string[];
    title: string;
    description: string;
};

export function buildMomoScript(monumentId: string): MomoScript {
    const m = assertMonumentCertified(monumentId);
    return composeScript(m);
}

function composeScript(m: MonumentRecord): MomoScript {
    const blocks: MomoScriptBlock[] = [
        {
            startSec: 0,
            endSec: 3,
            label: 'hook',
            narration: `${m.historicalFigure}. Un luogo reale della memoria.`,
            visualDirection:
                'Dettaglio epigrafe / pietra / scultura esistente — nessun soggetto umano a figura intera.',
        },
        {
            startSec: 4,
            endSec: 20,
            label: 'monument',
            narration: `Siamo al ${m.cemetery}, ${m.city}. ${m.sculpturalNotes}`,
            visualDirection:
                'Panning lento sul monumento documentato; close-up su bassorilievi e iscrizioni reali.',
        },
        {
            startSec: 21,
            endSec: 45,
            label: 'legacy',
            narration: `La memoria di ${m.historicalFigure} resta legata a questo spazio sacro, non a un’immagine inventata. Fonti: ${m.sources[0]}.`,
            visualDirection:
                'Mani che depongono un omaggio floreale alla base del monumento (solo braccia/mani).',
        },
        {
            startSec: 46,
            endSec: 58,
            label: 'closing',
            narration:
                'Presenza testimoniata. Cura. Ricordo. FloreMoria — luoghi della memoria.',
            visualDirection:
                'Ultimo dettaglio floreale e firma tipografica sobria su fondale pietra.',
        },
    ];

    const fullNarration = blocks.map((b) => b.narration).join(' ');
    const title = `La tomba di ${m.historicalFigure} | Luoghi della Memoria`;
    const description = `${m.historicalFigure} — ${m.cemetery}, ${m.city}. Documentario verticale FloreMoria su monumento reale.`;
    const hashtags = [
        '#FloreMoria',
        '#Monumental',
        '#LuoghiDellaMemoria',
        `#${m.historicalFigure.replace(/\s+/g, '')}`,
        '#StoriaItaliana',
    ];

    return {
        monumentId: m.id,
        historicalFigure: m.historicalFigure,
        cemetery: m.cemetery,
        durationSeconds: 58,
        blocks,
        fullNarration,
        hashtags,
        title,
        description,
    };
}
