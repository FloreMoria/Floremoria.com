import type { ChatSession } from '@/lib/chatStore';
import { loadWhatsAppCoreKb } from '@/lib/whatsappKnowledge';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { sanitizeWhatsAppDisplayName } from '@/lib/vera/displayName';

const BOUQUET_OMaggio_SPECIALE_URL =
    'https://www.floremoria.com/fiori-sulle-tombe/bouquet-omaggio-speciale';

function normalize(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function displayFirstName(session: ChatSession): string {
    const sanitized = sanitizeWhatsAppDisplayName(session.name);
    return extractFirstNameFromProfile(sanitized) || 'Utente';
}

function recentInboundBodies(session: ChatSession, limit = 8): string[] {
    return session.messages
        .filter((m) => m.direction === 'INBOUND')
        .slice(-limit)
        .map((m) => m.body || '');
}

export function isConfusionMessage(message: string): boolean {
    const m = normalize(message);
    return (
        m.includes('non ho capito') ||
        m.includes('non capisco') ||
        m.includes('non ho compreso') ||
        m.includes('piu chiara') ||
        m.includes('essere piu chiara') ||
        m.includes('puoi essere piu chiara') ||
        m.includes('puo essere piu chiara') ||
        m.includes('spiegare meglio') ||
        m.includes('mi spieghi meglio') ||
        m.includes('non e chiaro')
    );
}

export function countConfusionMessages(session: ChatSession): number {
    return recentInboundBodies(session).filter(isConfusionMessage).length;
}

/** Include il messaggio corrente (non ancora in sessione). */
export function totalConfusionIncludingCurrent(session: ChatSession, message: string): number {
    return countConfusionMessages(session) + (isConfusionMessage(message) ? 1 : 0);
}

export function isFloristMiniAppIssue(message: string): boolean {
    const m = normalize(message);
    return (
        m.includes('mini app') ||
        m.includes('miniapp') ||
        m.includes('mini-app') ||
        m.includes('applicazione') ||
        m.includes('app non') ||
        m.includes('non mi va') ||
        m.includes('non funziona') ||
        m.includes('link consegna') ||
        m.includes('pagina non') ||
        m.includes('come risolvo') ||
        (m.includes('link') && m.includes('ordine'))
    );
}

export function hasMiniAppThread(session: ChatSession): boolean {
    return recentInboundBodies(session, 12).some(isFloristMiniAppIssue);
}

export function isWarmPraiseThanks(message: string): boolean {
    const m = normalize(message);
    if (!m.includes('grazie')) return false;
    return (
        m.includes('fantastic') ||
        m.includes('brav') ||
        m.includes('gentil') ||
        m.includes('perfett') ||
        m.includes('aiuto') ||
        m.length > 28
    );
}

export function isStandalonePhotoText(message: string, mediaUrl?: string | null): boolean {
    if (mediaUrl) return false;
    const m = normalize(message);
    return m === 'foto' || m === 'immagine' || m === 'allegato';
}

export function isNewOrderWithLocationRequest(message: string): boolean {
    const m = normalize(message);
    if (!hasAny(m, ['ordine', 'ordinare', 'consegn', 'mandare fiori', 'inviare fiori'])) return false;
    if (hasAny(m, ['stato', 'modific', 'cambiar', 'nastro', 'bigliett', 'foto', 'arrivati', 'minuti fa'])) {
        return false;
    }
    return hasAny(m, ['vorrei', 'voglio', 'servono', 'posso', 'possibile']) || /\b(a|ad|in)\s+[a-z]/i.test(message);
}

function hasAny(haystack: string, needles: string[]): boolean {
    return needles.some((n) => haystack.includes(n));
}

function extractLocationHint(message: string): string | null {
    const match = message.match(/\b(?:a|ad|in|presso)\s+([A-Za-zÀ-ÿ' -]{2,40})/i);
    if (!match?.[1]) return null;
    return match[1]
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join(' ')
        .replace(/\?+$/, '');
}

export function buildOperatorHandoffReply(): string {
    return 'La sto passando a un operatore umano del nostro Staff, che la contatterà il prima possibile.';
}

export function buildFloristMiniAppSupportReply(
    message: string,
    session: ChatSession
): string | null {
    if (session.userType !== 'FLORIST') return null;
    if (!isFloristMiniAppIssue(message) && !hasMiniAppThread(session)) return null;

    const name = displayFirstName(session);
    const confusionTotal = totalConfusionIncludingCurrent(session, message);
    const m = normalize(message);

    if (confusionTotal >= 2 || m.includes('operatore') || m.includes('umano')) {
        return null;
    }

    if (m.includes('come risolvo')) {
        return (
            `Capito, ${name}. Provi così:\n` +
            `1) Apri il link ordine in Chrome o Safari (non dentro WhatsApp)\n` +
            `2) Ricarichi la pagina e accetti cookie/foto se richiesti\n` +
            `3) Se ancora non va, mi descriva cosa vede (schermo bianco, errore, ecc.)\n\n` +
            `In alternativa può inviarmi qui le foto della posa via WhatsApp: le registriamo uguale per l'ordine. Preferisce provare il browser o inviare le foto qui?`
        );
    }

    if (isConfusionMessage(message)) {
        return (
            `Mi scusi se non sono stata abbastanza chiara, ${name}. In sintesi: apra il link ordine con Chrome o Safari fuori da WhatsApp; se non funziona, può inviarci le foto della posa direttamente qui in chat.\n\n` +
            `Se preferisce, La passo subito a un operatore umano del nostro Staff — mi scriva pure "operatore".`
        );
    }

    return (
        `Mi dispiace per il problema con la mini-app, ${name}. ` +
        `Per capire al volo: cosa succede esattamente (pagina bianca, errore, link che non si apre)?\n\n` +
        `Nel frattempo può aprire il link in Chrome/Safari fuori da WhatsApp, oppure inviarci le foto della posa direttamente qui in chat — resta valida come prova consegna. Come preferisce procedere?`
    );
}

export function buildWarmPraiseThanksReply(session: ChatSession): string {
    const isFlorist = session.userType === 'FLORIST';
    if (isFlorist) {
        return 'Grazie a te! Siamo qui se serve altro. Buon lavoro 🌹';
    }
    return 'Grazie di cuore per le Sue parole: per noi è un onore accompagnarLa. Restiamo a Sua disposizione per qualsiasi esigenza 🌹';
}

export function buildStandalonePhotoTextReply(session: ChatSession): string {
    const name = displayFirstName(session);
    if (session.userType === 'FLORIST') {
        return (
            `Grazie ${name}, ho visto il Suo messaggio. ` +
            `Se ha inviato o sta per inviare la foto della posa, la registriamo subito. ` +
            `Se la mini-app non funziona, può mandare le foto direttamente qui in chat.`
        );
    }
    return (
        `Gentile ${name}, La ringrazio. ` +
        `Se desidera informazioni sulla foto di consegna del Suo ordine, verifico subito lo stato e La rassicuro personalmente. ` +
        `Mi conferma gentilmente il codice ordine o il nome del defunto?`
    );
}

export function buildNewOrderLocationReply(message: string, session: ChatSession): string | null {
    if (session.userType === 'FLORIST') return null;
    if (!isNewOrderWithLocationRequest(message)) return null;

    const location = extractLocationHint(message) || 'zona indicata';
    const name = displayFirstName(session);
    const kb = loadWhatsAppCoreKb();

    return (
        `Gentile ${name}, confermiamo la consegna a ${location}. ` +
        `Per un servizio completo con posa curata e foto testimonianza, Le consigliamo il Bouquet Omaggio Speciale (da EUR 49,99):\n` +
        `${BOUQUET_OMaggio_SPECIALE_URL}\n\n` +
        `Se preferisce altre opzioni, può consultare il catalogo tombe: ${kb.catalogTombsUrl}\n` +
        `Mi indichi pure data e orario desiderati e La seguo passo passo.`
    );
}

/** Risposta incompleta (troncata da Meta/Gemini o taglio catalogo). */
export function looksIncompleteReply(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length < 12) return true;
    if (/https?:\/\/\S+$/.test(trimmed)) return false;
    if (/[.!?…🌹]$/.test(trimmed)) return false;
    if (/\b(desider|vedo che|se |oppure|per es|chrome o safari)\)?$/i.test(trimmed)) return true;
    const lastWord = trimmed.split(/\s+/).pop() || '';
    if (lastWord.length <= 3 && !/[.!?]$/.test(trimmed)) return true;
    return false;
}

export function repairIncompleteReply(text: string, userType: ChatSession['userType']): string {
    if (userType === 'FLORIST') {
        return (
            `${text.replace(/[,.\s]+$/, '')}. ` +
            `Se la mini-app non risponde, può inviare le foto della posa direttamente qui in chat: le accettiamo come prova consegna. Preferisce provare così?`
        );
    }
    return (
        `${text.replace(/[,.\s]+$/, '')}. ` +
        `Resto a Sua disposizione: mi scriva pure come posso aiutarLa.`
    );
}
