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
    let blocks: MomoScriptBlock[];

    if (m.id === 'alessandro-volta-camnago') {
        blocks = [
            {
                startSec: 0,
                endSec: 3,
                label: 'hook',
                narration: "Qui riposa l'uomo che ha dato la scintilla al mondo moderno.",
                visualDirection:
                    'Vista solenne del tempietto neoclassico circolare di Camnago Volta — nessun soggetto umano a figura intera.',
            },
            {
                startSec: 4,
                endSec: 20,
                label: 'monument',
                narration:
                    'Siamo a Camnago Volta, Como. Il mausoleo neoclassico circolare custodisce il busto in marmo di Comolli e il rilievo della celebre pila.',
                visualDirection:
                    'Dettaglio scultoreo del busto in marmo di Giovanni Battista Comolli e dei bassorilievi della pila voltaica.',
            },
            {
                startSec: 21,
                endSec: 40,
                label: 'legacy',
                narration:
                    "L'invenzione della pila e l'eredità silenziosa custodita tra le colline di Como testimoniano come la scintilla del genio continui a vivere.",
                visualDirection:
                    'Luce tra le colonne neoclassiche del tempietto e inquadratura lenta sull’architettura sacra.',
            },
            {
                startSec: 41,
                endSec: 45,
                label: 'closing',
                narration:
                    'Un gesto di cura e rispetto per chi ha illuminato la storia. FloreMoria: la memoria eterna.',
                visualDirection:
                    'Inquadratura close-up esclusiva sulle mani che depongono una composizione floreale sobria alla base.',
            },
        ];
    } else {
        blocks = [
            {
                startSec: 0,
                endSec: 3,
                label: 'hook',
                narration: `${m.historicalFigure}. Un luogo autentico della memoria.`,
                visualDirection:
                    'Dettaglio epigrafe e scultura esistente — nessun soggetto umano a figura intera.',
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
                endSec: 40,
                label: 'legacy',
                narration: `La memoria di ${m.historicalFigure} vive in questo spazio sacro tra storia e silenzio. Fonti certificate: ${m.sources[0]}.`,
                visualDirection:
                    'Luce e dettagli architettonici del luogo sacro.',
            },
            {
                startSec: 41,
                endSec: 45,
                label: 'closing',
                narration:
                    'Presenza, cura e ricordo testimoniano la memoria. FloreMoria.',
                visualDirection:
                    'Mani che depongono un omaggio floreale sobrio alla base (solo mani/dettaglio).',
            },
        ];
    }

    const fullNarration = blocks.map((b) => b.narration).join(' ');
    const title = `La tomba di ${m.historicalFigure} | Luoghi della Memoria`;
    const description = `${m.historicalFigure} — ${m.cemetery}, ${m.city}. Documentario verticale FloreMoria su monumento reale.`;
    const hashtags = [
        '#FloreMoria',
        '#Monumental',
        '#LuoghiDellaMemoria',
        `#${m.historicalFigure.replace(/\s+/g, '')}`,
        '#StoriaItaliana',
        '#InstagramReels',
    ];

    return {
        monumentId: m.id,
        historicalFigure: m.historicalFigure,
        cemetery: m.cemetery,
        durationSeconds: 45,
        blocks,
        fullNarration,
        hashtags,
        title,
        description,
    };
}
