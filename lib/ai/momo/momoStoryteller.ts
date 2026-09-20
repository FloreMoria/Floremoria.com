/**
 * MOMO storyteller — script 9:16 (12–25s) con hook misterioso stile sticker Instagram nativo.
 * Vincoli: footage reale, domanda aperta su sticker bianco rounded, pianoforte evocativo.
 */
import {
    assertMonumentCertified,
    type MonumentRecord,
} from '@/lib/ai/momo/momoMonuments';

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
    historicalFigure: string;
    cemetery: string;
    durationSeconds: number;
    hookQuestion: string;
    instagramTag: string;
    blocks: MomoScriptBlock[];
    fullNarration: string;
    hashtags: string[];
    title: string;
    description: string;
};

export function buildMomoScript(monumentId: string, customDuration = 15): MomoScript {
    const m = assertMonumentCertified(monumentId);
    return composeScript(m, customDuration);
}

function composeScript(m: MonumentRecord, durationSeconds = 15): MomoScript {
    let hookQuestion: string;
    let title: string;
    let description: string;
    let blocks: MomoScriptBlock[];

    if (m.id === 'alessandro-volta-camnago') {
        hookQuestion =
            'Sapete chi è il personaggio molto importante che giace nella cappella di questo piccolo cimitero di campagna?';
        title = 'Chi riposa in questo cimitero di campagna? | FloreMoria';
        description =
            'Camminata tra i sentieri di Camnago Volta (Como), verso il mausoleo neoclassico circolare. Indovina chi riposa qui.';
        blocks = [
            {
                startSec: 0,
                endSec: durationSeconds,
                label: 'footage',
                visualDirection:
                    'Footage reale POV dal vivo: camminata su sentiero di ghiaia e cipressi verso la cappella di campagna.',
            },
        ];
    } else {
        hookQuestion = `Sapete chi giaceva in questo bel cimitero ${m.city.toLowerCase().includes('como') ? 'sul Lago di Como' : 'di ' + m.city}?`;
        title = `Chi riposa al cimitero di ${m.city}? | FloreMoria`;
        description = `Panoramica reale dal vivo del cimitero di ${m.cemetery} a ${m.city}.`;
        blocks = [
            {
                startSec: 0,
                endSec: durationSeconds,
                label: 'footage',
                visualDirection:
                    'Footage reale dal vivo: panoramica paesaggistica e luce naturale sul luogo sacro.',
            },
        ];
    }

    const hashtags = [
        '#FloreMoria',
        '#ReelsItalia',
        '#LuoghiDellaMemoria',
        '#LagoDiComo',
        '#Storia',
        '#MisteriItaliani',
    ];

    return {
        monumentId: m.id,
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
    };
}
