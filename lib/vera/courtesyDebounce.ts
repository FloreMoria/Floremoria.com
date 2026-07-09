import type { ChatSession } from '@/lib/chatStore';

function normalizeForCourtesy(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Intenti operativi espliciti: procedure (foto, ordine, stato) solo se presenti. */
const OPERATIONAL_INTENT_KEYWORDS = [
    'ordine',
    'consegnat',
    'consegna',
    'foto',
    'posa',
    'scritta',
    'modific',
    'tomba',
    'cimitero',
    'chiuso',
    'ritard',
    'problema',
    'non trovo',
    'codice',
    'stato',
    'aggiorn',
    'bigliett',
    'nastro',
    'orario',
    'vorrei',
    'voglio',
    'devo',
    'serve',
    'quando',
    'dove',
    'quanto',
    'prezzo',
    'funerale',
    'bouquet',
    'omaggio',
    'fiori',
    'camera mortuaria',
    'completato',
    'inviato',
    'mandato',
    'allegato',
    'aprite',
    'orari',
    'assistenza',
    'catalogo',
    'comprare',
    'ordinare',
];

const ISOLATED_COURTESY_PATTERN =
    /^(ciao( ciao)?|buongiorno|buon giorno|buonasera|buona sera|salve|buon pomeriggio|buondi|hey|ehi|grazie( mille)?|ti ringrazio|la ringrazio|molte grazie)$/;

export function hasOperationalServiceIntent(message: string): boolean {
    const m = normalizeForCourtesy(message);
    if (!m) return false;
    if (/\bft-[a-z]{2}-\d{2}-\d{3}\b/i.test(message)) return true;
    return OPERATIONAL_INTENT_KEYWORDS.some((keyword) => m.includes(keyword));
}

/**
 * Messaggio che contiene SOLO saluto, ringraziamento o cortesia isolata —
 * senza richiesta operativa né codice ordine nel testo.
 */
export function isIsolatedCourtesyMessage(message: string): boolean {
    const m = normalizeForCourtesy(message);
    if (!m) return false;
    if (hasOperationalServiceIntent(message)) return false;
    return ISOLATED_COURTESY_PATTERN.test(m);
}

export function buildSymmetricCourtesyReply(params: {
    message: string;
    userType: ChatSession['userType'];
    displayName?: string;
}): string {
    const m = normalizeForCourtesy(params.message);
    const isFlorist = params.userType === 'FLORIST';

    if (/^(grazie|grazie mille|ti ringrazio|la ringrazio|molte grazie)$/.test(m)) {
        return isFlorist
            ? 'Prego! Dimmi pure, come posso aiutarti? 🌹'
            : 'Prego! Come posso esserLe utile oggi? 🌹';
    }

    if (/^(buonasera|buona sera)$/.test(m)) {
        return isFlorist
            ? 'Buonasera! Dimmi pure, come posso aiutarti? 🌹'
            : 'Buonasera! Come posso esserLe utile oggi? 🌹';
    }

    if (/^(buongiorno|buon giorno|buondi)$/.test(m)) {
        return isFlorist
            ? 'Buongiorno! Dimmi pure, come posso aiutarti? 🌹'
            : 'Buongiorno! Come posso esserLe utile oggi? 🌹';
    }

    if (/^(buon pomeriggio)$/.test(m)) {
        return isFlorist
            ? 'Buon pomeriggio! Dimmi pure, come posso aiutarti? 🌹'
            : 'Buon pomeriggio! Come posso esserLe utile oggi? 🌹';
    }

    return isFlorist
        ? 'Ciao! Dimmi pure, come posso aiutarti oggi? 🌹'
        : 'Ciao! Buongiorno. Come posso esserLe utile oggi? 🌹';
}

export const VERA_SYMMETRIC_GREETING_RULE = `
REGOLA UNIVERSALE — SALUTO SIMMETRICO (Small Talk Debounce):
- Se il messaggio contiene SOLO un saluto, un ringraziamento o una cortesia isolata (es. "ciao", "buongiorno", "salve", "grazie", "buonasera") SENZA richiesta operativa né codice ordine nel testo, rispondi ESCLUSIVAMENTE ricambiando saluto o cortesia in modo speculare e naturale.
- NON attivare fallback procedurali, NON chiedere codici ordine, foto della posa o dettagli logistici in questa fase.
- Comportati come un operatore umano che attende con garbo che l'interlocutore finisca di digitare.
- Esempi: utente "ciao" → "Ciao! Buongiorno. Come posso esserLe utile oggi? 🌹"; fiorista "buongiorno" → "Buongiorno! Dimmi pure, come posso aiutarti? 🌹"; utente "grazie" isolato → "Prego! Come posso esserLe utile oggi? 🌹" (senza firma di chiusura).
`.trim();

export const VERA_INTENT_BEFORE_ACTION_RULE = `
VALUTAZIONE DELL'INTENTO PRIMA DELL'AZIONE:
- Procedure operative (richiesta foto a fioristi, aggiornamenti stato ordine, modifiche, escalation logistica) SOLO se l'intento è esplicitamente legato a un servizio (es. "ho consegnato i fiori", "vorrei cambiare la scritta", "a che ora aprite?", "stato del mio ordine").
- Su messaggi frammentati o ambigui senza intento chiaro: una sola domanda aperta e umana, mai elenco catalogo o richieste tecniche premature.
`.trim();
