import type { ChatSession } from '@/lib/chatStore';
import { getItalyOpeningGreeting } from '@/lib/datetime/italyGreeting';

function normalizeForCourtesy(value: string): string {
    const clean = (value || '')
        .replace(/^\[Sequenza messaggi aggregati[^\]]*\]\s*/i, '')
        .replace(/^\d+\.\s*\[\d{2}:\d{2}(?::\d{2})?\]\s*/i, '')
        .trim();

    return clean
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
    /^(ciao( ciao)?|buongiorno|buon giorno|buonasera|buona sera|buona serata|buona giornata|buona notte|salve|buon pomeriggio|buondi|hey|ehi|grazie( mille)?( a (voi|te|lei))?|ti ringrazio|la ringrazio|molte grazie|prego|di nulla)$/;

/** Ack corti senza richiesta operativa (OK, sì, d'accordo, emoji già coperte altrove). */
const SHORT_ACK_PATTERN =
    /^(ok|okay|okey|va bene|va benissimo|daccordo|d'accordo|perfetto|ricevuto|certo|si|sì|ok grazie|okok|👍|🙏|✅|🤝|❤️|🌹)$/;

/** Conferma cortese di data/giorno ("Lunedì va benissimo", "Per sabato ok"). */
const WEEKDAY_OR_DATE_HINT =
    /\b(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\b|\b\d{1,2}\s*[\/.\-]\s*\d{1,2}(?:\s*[\/.\-]\s*\d{2,4})?\b/;

const SCHEDULE_CONFIRM_HINT =
    /\b(va benissimo|va bene|va ottimo|perfetto|daccordo|d'accordo|confermo|ok per|va bene cos[iì]|va benone)\b/;

/** Cortesia di chiusura reciproca: non riaprire loop di saluti. */
const POST_FAREWELL_COURTESY_PATTERN =
    /^(anche a (lei|te|voi|loro)|altrettanto|ugualmente|di nulla|prego|grazie( mille)?|ti ringrazio|la ringrazio|molte grazie|ok grazie|va bene grazie)$/;

const EMOJI_ONLY_PATTERN =
    /^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\s🌹❤️🙏👍👏✨✅🤝])+$/u;

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

/** OK / sì / d'accordo isolati senza intento operativo. */
export function isShortAckWithoutOperationalIntent(message: string): boolean {
    const raw = (message || '').trim();
    if (!raw) return false;
    if (hasOperationalServiceIntent(message)) return false;
    const m = normalizeForCourtesy(raw);
    return SHORT_ACK_PATTERN.test(m) || SHORT_ACK_PATTERN.test(raw.toLowerCase());
}

/**
 * Conferma di disponibilità/data senza nuova richiesta operativa.
 * Perché: "Lunedì va benissimo" non deve aprire un secondo prompt di completamento.
 */
export function isCourtesyScheduleConfirmation(message: string): boolean {
    const raw = (message || '').trim();
    if (!raw || raw.length > 160) return false;
    if (hasOperationalServiceIntent(message)) {
        // "consegna" / "ordine" nel testo → lascia al flusso operativo.
        // Eccezione: se è solo conferma giorno+ok senza verbo di richiesta, resta cortesia.
        const m = normalizeForCourtesy(raw);
        const hasRequestVerb = /\b(vorrei|voglio|dev[o]|serve|mandami|inviami|cambi|modific|quanto|dove|quando\s+arriva)\b/.test(
            m
        );
        if (hasRequestVerb) return false;
    }
    const m = normalizeForCourtesy(raw);
    if (!m) return false;
    return WEEKDAY_OR_DATE_HINT.test(m) && SCHEDULE_CONFIRM_HINT.test(m);
}

/** Reply deterministica breve dopo conferma data/giorno. */
export function buildCourtesyScheduleConfirmReply(params: {
    userType: ChatSession['userType'];
    displayName?: string;
}): string {
    const name = params.displayName?.trim();
    if (params.userType === 'FLORIST') {
        return name
            ? `Perfetto ${name}, annotato. Grazie della conferma!`
            : 'Perfetto, annotato. Grazie della conferma!';
    }
    return name
        ? `Perfetto, ${name}: ho annotato la conferma. Restiamo a sua disposizione.`
        : 'Perfetto: ho annotato la conferma. Restiamo a sua disposizione.';
}

/** Reaction Meta, sticker, sola emoji, o placeholder legacy. */
export function isWhatsAppReactionOrEmojiOnly(message: string): boolean {
    const raw = (message || '').trim();
    if (!raw) return false;
    if (/^\[reaction\]$/i.test(raw)) return true;
    if (/^\[sticker\]$/i.test(raw)) return true;
    if (/^sticker$/i.test(raw)) return true;
    if (/^reaction$/i.test(raw)) return true;
    if (/^reazione:\s*.+/i.test(raw)) return true;
    if (/^reazione rimossa$/i.test(raw)) return true;
    if (/^reazione whatsapp/i.test(raw)) return true;
    if (/messaggio non supportato da meta/i.test(raw)) return true;
    return EMOJI_ONLY_PATTERN.test(raw);
}

/**
 * Dopo un congedo già inviato da VERA/staff, un semplice "Anche a lei" / "Grazie"
 * non merita nuova risposta (evita loop di cortesia).
 */
export function isRedundantPostFarewellCourtesy(
    message: string,
    session: ChatSession
): boolean {
    const m = normalizeForCourtesy(message);
    if (!m) return false;
    if (hasOperationalServiceIntent(message)) return false;
    if (!POST_FAREWELL_COURTESY_PATTERN.test(m) && !ISOLATED_COURTESY_PATTERN.test(m)) {
        return false;
    }

    const recentOutbound = [...session.messages]
        .reverse()
        .filter((msg) => msg.direction === 'OUTBOUND')
        .slice(0, 4);

    const farewellHints =
        /buona (giornata|serata|notte)|a presto|arrivederci|restiamo a sua|disposizione|grazie a lei|prego!|🌹/;

    return recentOutbound.some((msg) => farewellHints.test((msg.body || '').toLowerCase()));
}

/**
 * Dopo conferma data/presa in carico già inviata da VERA, non riaprire loop
 * su "Buona serata" / "Grazie" / "ok" (caso Benedetta Carrozza).
 */
export function isRedundantAfterScheduleConfirmAck(
    message: string,
    session: ChatSession
): boolean {
    const m = normalizeForCourtesy(message);
    if (!m) return false;
    if (hasOperationalServiceIntent(message) && !isCourtesyScheduleConfirmation(message)) {
        return false;
    }
    const closingOrAck =
        POST_FAREWELL_COURTESY_PATTERN.test(m) ||
        ISOLATED_COURTESY_PATTERN.test(m) ||
        SHORT_ACK_PATTERN.test(m) ||
        /^(buona serata|a luned[iì]|a presto|grazie mille a voi)/.test(m);
    if (!closingOrAck) return false;

    const recentOutbound = [...session.messages]
        .reverse()
        .filter((msg) => msg.direction === 'OUTBOUND')
        .slice(0, 5);

    const scheduleAckHints =
        /luned[iì] va benissimo|annotato|grazie della conferma|incarico confermato|perfettamente nei tempi|consegna [eè] prevista|va benissimo/;

    return recentOutbound.some((msg) => scheduleAckHints.test((msg.body || '').toLowerCase()));
}

/** Fragmenti rumorosi / typo isolati (es. "?*", "okV" già coperto da ack). */
export function isNoiseFragmentMessage(message: string): boolean {
    const raw = (message || '').trim();
    if (!raw) return true;
    if (/^[?*!.…,\-\s]+$/.test(raw)) return true;
    if (raw.length <= 2 && !/^(ok|si|sì)$/i.test(raw)) return true;
    return false;
}

/**
 * Vera non risponde: reaction, cortesia/ack isolati, o ringraziamento dopo congedo.
 * Perché: P0 anti-ridondanza (Simone/Carolina/Benedetta) — niente ping-pong su "Grazie"/"OK"/emoji.
 */
export function shouldSilenceVeraReply(message: string, session: ChatSession): boolean {
    if (isNoiseFragmentMessage(message)) return true;
    if (isWhatsAppReactionOrEmojiOnly(message)) return true;
    if (isIsolatedCourtesyMessage(message)) return true;
    if (isShortAckWithoutOperationalIntent(message)) return true;
    if (isRedundantPostFarewellCourtesy(message, session)) return true;
    if (isRedundantAfterScheduleConfirmAck(message, session)) return true;
    return false;
}

export function buildSymmetricCourtesyReply(params: {
    message: string;
    userType: ChatSession['userType'];
    displayName?: string;
}): string {
    const m = normalizeForCourtesy(params.message);
    const isFlorist = params.userType === 'FLORIST';
    const opening = getItalyOpeningGreeting();

    if (/^(grazie|grazie mille|ti ringrazio|la ringrazio|molte grazie)$/.test(m)) {
        return isFlorist ? 'Prego! Dimmi pure se serve altro.' : 'Prego. Se serve altro, scriva pure qui.';
    }

    if (/^(buonasera|buona sera|buongiorno|buon giorno|buondi|buon pomeriggio|ciao( ciao)?|salve)$/.test(m)) {
        // Rispecchia l'orario Italia, non il saluto dell'utente (evita "Buongiorno" alle 19).
        return isFlorist
            ? `${opening}! Dimmi pure, come posso aiutarti?`
            : `${opening}. Come posso esserLe utile?`;
    }

    return isFlorist
        ? `${opening}! Dimmi pure, come posso aiutarti oggi?`
        : `${opening}. Come posso esserLe utile?`;
}

export const VERA_SYMMETRIC_GREETING_RULE = `
REGOLA UNIVERSALE — SALUTO SIMMETRICO (Small Talk Debounce):
- Se il messaggio contiene SOLO un saluto o un ringraziamento isolato SENZA richiesta operativa, ricambia in modo breve e naturale.
- Il saluto DEVE seguire l'orario Italia (Europe/Rome): 06–14 "Buongiorno", 15–23 "Buonasera", 00–05 "Buonanotte". Mai "Buongiorno" di sera.
- NON attivare procedure (foto, ordine, catalogo) su sola cortesia.
- Su reaction / "Anche a lei" dopo un congedo: SILENZIO totale (nessun messaggio).
`.trim();

export const VERA_INTENT_BEFORE_ACTION_RULE = `
VALUTAZIONE DELL'INTENTO PRIMA DELL'AZIONE:
- Procedure operative (foto, stato ordine, modifiche, indirizzi, biglietti) SOLO se l'intento è esplicitamente legato a un servizio.
- Prima di rispondere su dati logistici: usa il contesto ordine già caricato; se manca un pezzo, una sola presa in carico + staff, senza loop.
- Su messaggi frammentati o ambigui: una sola domanda aperta e umana, mai elenco catalogo prematuro.
`.trim();

/** Vietati doppi messaggi di attesa nello stesso minuto. */
export const VERA_NO_REDUNDANT_WAIT_RULE = `
ANTI-RIDONDANZA ATTESA (CRITICAL):
- Vietato inviare due messaggi di attesa/verifica consecutivi (es. "Verifico..." e subito "Sto controllando...").
- Una sola frase di presa in carico chiara ed empatica è sufficiente; poi agisci o scala allo Staff.
- In contestazioni economiche: una sola risposta Regola Aurea, poi notifica staff — niente ping-pong.
`.trim();

/**
 * Anti-loop conversazionale: foto spezzate, "ok", conferme informali (caso Matilde Assumma).
 */
export const VERA_ANTI_LOOP_NATURAL_TONE_RULE = `
ANTI-LOOP E TONO NATURALE (CRITICAL — WhatsApp):
- VIETATO ripetere le stesse frasi, gli stessi saluti formali o lo stesso template di sollecito se la fiorista/il contatto ha già risposto o se il dialogo è in corso nello storico.
- Se arrivano più messaggi o foto in sequenza (anche spezzati): tratta il blocco come UN solo turno e rispondi UNA sola volta, completa e umana.
- Conferme informali ("ok", "va bene", "ricevuto", "si si", invio foto senza testo): riconosci e chiudi senza chiedere ulteriori conferme ridondanti ("mi confermi?", "aspetto conferma", "se manca ancora…") se non strettamente necessario.
- Su foto di posa già ricevute: un ringraziamento breve basta; non reiterare istruzioni mini-app né sollecitare lo stesso scatto a ogni allegato.
- Mai tono robotico o da call center: varia il linguaggio, resta breve, empatica e collaborativa.
`.trim();
