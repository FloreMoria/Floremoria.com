import fs from 'node:fs';
import path from 'node:path';

export type HistoricalChatAudience = 'UTENTE' | 'FLORIST';

const HISTORICAL_KB_PATH = path.join(process.cwd(), 'docs', 'whatsapp', 'knowledge_base_whatsapp.txt');

const CHAPTER_CLIENTI = 'CAPITOLO 1: CONVERSAZIONI STORICHE CON I CLIENTI';
const CHAPTER_FIORISTI = 'CAPITOLO 2: CONVERSAZIONI STORICHE CON I FIORISTI PARTNER';

/** Estratto massimo per capitolo nel prompt LLM (evita overflow token). */
const MAX_EXCERPT_CHARS_CLIENTI = 14_000;
const MAX_EXCERPT_CHARS_FIORISTI = 10_000;

let fullHistoricalCache: string | null = null;

function loadFullHistoricalKb(): string {
    if (fullHistoricalCache !== null) return fullHistoricalCache;
    try {
        fullHistoricalCache = fs.readFileSync(HISTORICAL_KB_PATH, 'utf-8');
    } catch {
        fullHistoricalCache = '';
    }
    return fullHistoricalCache;
}

function sliceChapter(full: string, startMarker: string, endMarker: string | null, maxChars: number): string {
    const start = full.indexOf(startMarker);
    if (start < 0) return '';

    let end = full.length;
    if (endMarker) {
        const endIdx = full.indexOf(endMarker, start + startMarker.length);
        if (endIdx > start) end = endIdx;
    }

    return full
        .slice(start, end)
        .replace(/[\f\u000c]/g, '')
        .trim()
        .slice(0, maxChars);
}

export function extractClientHistoricalExcerpt(): string {
    const full = loadFullHistoricalKb();
    return sliceChapter(full, CHAPTER_CLIENTI, CHAPTER_FIORISTI, MAX_EXCERPT_CHARS_CLIENTI);
}

export function extractFloristHistoricalExcerpt(): string {
    const full = loadFullHistoricalKb();
    return sliceChapter(full, CHAPTER_FIORISTI, null, MAX_EXCERPT_CHARS_FIORISTI);
}

const LINEE_GUIDA_UTENTE = `
=== LINEE GUIDA TONO DI VOCE — UTENTI FINALI (da chat storiche reali) ===
REGISTRO: Lei formale, garbo, empatia, rispetto assoluto del lutto e del ricordo. Mai bot aziendale freddo.

SALUTI (imitare la struttura storica):
- "Buongiorno Sig./sig. [Nome], ..."
- "Gentile [Nome], abbiamo ricevuto il suo ordine e la ringraziamo."
- "Buona sera [Nome], ..."

CONSEGNA E FOTO (calore umano, non notifica automatica):
- "il nostro fiorista partner ha consegnato i suoi fiori sulla tomba di..."
- "Le alleghiamo foto" / "ecco le foto, prima e dopo la consegna"
- Confermare con cura dettagli richiesti (luce votiva, pulizia marmo, prima/dopo)

ORDINI E FOLLOW-UP:
- Ringraziare sempre per ordine e fiducia
- "Abbiamo già incaricato il nostro partner di zona"
- "Sottolineeremo le sue richieste al partner"

SCUSE E PROBLEMI (umiltà sincera, mai difensiva):
- "Ha ragione, lo avevamo indicato al fiorista, ma non l'ha fatta. Ci scusiamo..."
- Offrire reso o alternativa con tatto quando maltempo o ritardi

CHIUSURE:
- "Tutto lo staff di FloreMoria le augura buona giornata 🌹"
- "Con la speranza di averle fatto un servizio secondo le sue aspettative"
- "La ringraziamo per permetterci di stare al suo fianco in queste occasioni così intime"

VIETATO: tono call center, SMS freddo, pressione commerciale, parola "cliente" (solo "utente" o Lei diretto).
`.trim();

const LINEE_GUIDA_FIORISTA = `
=== LINEE GUIDA TONO DI VOCE — FIORISTI PARTNER (da chat storiche reali) ===
REGISTRO: Tu informale, colloquiale, cordiale e operativo. Partner di lavoro, non utente in lutto.

SALUTI:
- "Buongiorno [Nome], ..."
- "Ciao [Nome]" / "Ciao 😊" quando il rapporto è consolidato
- "Buona sera sig.ra [Nome], le scriviamo da FloreMoria" (Lei solo in primo contatto formale)

FOCUS OPERATIVO (breve e chiaro):
- Richiedere/confermare foto posa e codice ordine (es. FT-RM-26-001)
- Bonifici, fatture, IBAN, coordinate — tono pratico e rispettoso
- "Attendiamo foto come sempre. Buona giornata e buon lavoro 🌹"
- "Grazie. Dopo pranzo procedo."

CORDIALITÀ:
- "scusa il disturbo" quando si sollecita
- Ringraziare sempre per collaborazione
- Chiudere con "Grazie", "Ciao alla prossima 🌹", "buon lavoro"

PARTNERSHIP:
- Benvenuto tra i partner, spiegare flusso consegna/foto
- Invito moduli partnership con tono entusiasta ma non invadente

VIETATO: Lei eccessivo dopo rapporto consolidato, linguaggio funebre, condoglianze (non è un utente in lutto).
`.trim();

/**
 * Blocco prompt con linee guida + estratti reali dal file storico annuale.
 * Fonte: docs/whatsapp/knowledge_base_whatsapp.txt (CAPITOLO 1 e 2).
 */
export function buildHistoricalToneContext(audience: HistoricalChatAudience): string {
    if (audience === 'FLORIST') {
        const excerpt = extractFloristHistoricalExcerpt();
        return [
            LINEE_GUIDA_FIORISTA,
            '',
            '=== ESEMPI STORICI DI CONVERSAZIONE CON FIORISTI (estratto anonimizzato) ===',
            'Imita fedelmente struttura dei saluti, scelta delle parole, brevità operativa e cordialità:',
            excerpt || '(archivio storico non disponibile)',
        ].join('\n');
    }

    const excerpt = extractClientHistoricalExcerpt();
    return [
        LINEE_GUIDA_UTENTE,
        '',
        '=== ESEMPI STORICI DI CONVERSAZIONE CON UTENTI (estratto anonimizzato) ===',
        'Imita fedelmente struttura dei saluti, empatia, garbo e gestione foto/consegne:',
        excerpt || '(archivio storico non disponibile)',
    ].join('\n');
}

export function resolveHistoricalAudience(
    userType: 'UTENTE' | 'FLORIST' | 'UNKNOWN' | undefined
): HistoricalChatAudience {
    return userType === 'FLORIST' ? 'FLORIST' : 'UTENTE';
}
