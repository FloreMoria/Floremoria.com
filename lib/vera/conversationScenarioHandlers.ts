import type { ChatSession } from '@/lib/chatStore';
import { loadWhatsAppCoreKb } from '@/lib/whatsappKnowledge';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { sanitizeWhatsAppDisplayName } from '@/lib/vera/displayName';

export const GEMINI_MAX_OUTPUT_TOKENS = 1000;

export const FLOREMORIA_INSTANT_TRANSFER_IBAN = 'IT60 X054 2811 1010 0000 0123 456';
export const FLOREMORIA_INSTANT_TRANSFER_HOLDER = 'FloreMoria S.r.l.';

const BOUQUET_OMaggio_SPECIALE_URL =
    'https://www.floremoria.com/fiori-sulle-tombe/bouquet-omaggio-speciale';

const TOMB_ACCESSORY_PRICES = {
    lumino: 'EUR 3,49',
    biglietto: 'EUR 2,49',
} as const;

const FUNERAL_ACCESSORY_PRICES = {
    ceri: 'EUR 24,99',
    nastro: 'EUR 14,99',
} as const;

function normalize(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasAny(haystack: string, needles: string[]): boolean {
    return needles.some((n) => haystack.includes(n));
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

type AccessoryCatalog = 'tombs' | 'funeral';

function inferAccessoryCatalog(message: string, session: ChatSession): AccessoryCatalog {
    const combined = [message, ...recentInboundBodies(session, 6)].join(' ');
    const m = normalize(combined);
    if (
        hasAny(m, [
            'funerale',
            'camera mortuaria',
            'chiesa',
            'copribara',
            'cuscino',
            'piramide',
            'corona',
            ' ff ',
            'ff-',
            'piant',
            'piccoli amici',
            ' pa ',
            'pa-',
            'ceri',
            'candele',
            'nastro commemor',
        ])
    ) {
        return 'funeral';
    }
    return 'tombs';
}

export function isAccessoryPriceInquiry(message: string): boolean {
    const m = normalize(message);
    const mentionsAccessory = hasAny(m, [
        'lumino',
        'lumini',
        'bigliett',
        'messaggio',
        'ceri',
        'candele',
        'nastro',
        'nastri',
    ]);
    if (!mentionsAccessory) return false;
    return (
        hasAny(m, ['prezzo', 'prezzi', 'costo', 'costi', 'quanto costa', 'quanto costano', 'tariffa', 'euro']) ||
        m.includes('?') ||
        hasAny(m, ['quanto', 'a quanto', 'costa il', 'costa la', 'costa un'])
    );
}

export function buildAccessoryPriceReply(message: string, session: ChatSession): string | null {
    if (session.userType === 'FLORIST') return null;
    if (!isAccessoryPriceInquiry(message)) return null;

    const name = displayFirstName(session);
    const catalog = inferAccessoryCatalog(message, session);

    if (catalog === 'funeral') {
        return (
            `Gentile ${name}, per omaggi funerale (FF) e piante (PA) gli accessori hanno questi prezzi:\n` +
            `• Set ceri/candele: ${FUNERAL_ACCESSORY_PRICES.ceri}\n` +
            `• Nastro commemorativo: ${FUNERAL_ACCESSORY_PRICES.nastro}\n\n` +
            `Può selezionarli in fase d'ordine sul sito o indicarmi qui quale desidera aggiungere.`
        );
    }

    return (
        `Gentile ${name}, per le consegne sulla tomba (FT) gli accessori costano:\n` +
        `• Lumino: ${TOMB_ACCESSORY_PRICES.lumino}\n` +
        `• Messaggio/biglietto: ${TOMB_ACCESSORY_PRICES.biglietto}\n\n` +
        `Può aggiungerli al bouquet durante l'ordine. Desidera che La guidi nella scelta del bouquet?`
    );
}

export function isCemeteryCoverageQuestion(message: string): boolean {
    const m = normalize(message);
    if (!hasAny(m, ['cimitero', 'cimiteri', 'tomba', 'tombe'])) return false;
    return (
        hasAny(m, ['consegnate', 'consegna', 'consegnate in', 'qualsiasi cimitero', 'lontano', 'abito lontano']) ||
        (m.includes('?') && hasAny(m, ['consegna', 'consegnate', 'copertura']))
    );
}

export function buildCemeteryCoverageReply(session: ChatSession): string {
    const name = displayFirstName(session);
    return (
        `Gentile ${name}, sì: siamo specializzati nella consegna direttamente all'interno di qualsiasi cimitero d'Italia, ` +
        `sulla tomba, con posa curata e testimonianza fotografica. ` +
        `Anche se abita lontano, il nostro fiorista partner locale si occupa di tutto in loco. ` +
        `Mi indichi pure cimitero e comune e La seguo passo passo.`
    );
}

export function isInstantTransferPaymentRequest(message: string): boolean {
    const m = normalize(message);
    if (!hasAny(m, ['bonifico', 'bonific', 'sepa', 'iban'])) return false;
    return hasAny(m, ['pagare', 'pagamento', 'pago', 'posso', 'accettate', 'vorrei', 'voglio', 'con bonifico']);
}

export function buildInstantTransferPaymentReply(session: ChatSession): string {
    const name = displayFirstName(session);
    return (
        `Gentile ${name}, accettiamo il bonifico ESCLUSIVAMENTE in Bonifico Istantaneo (SEPA Instant), ` +
        `così possiamo garantire i tempi di consegna.\n\n` +
        `IBAN: ${FLOREMORIA_INSTANT_TRANSFER_IBAN}\n` +
        `Intestatario: ${FLOREMORIA_INSTANT_TRANSFER_HOLDER}\n` +
        `Causale: nome e cognome del defunto + data consegna desiderata.\n\n` +
        `Appena ricevuto l'accredito istantaneo, confermiamo subito l'ordine e La teniamo aggiornata su WhatsApp.`
    );
}

export function isWebsiteFormIssue(message: string): boolean {
    const m = normalize(message);
    if (isFloristMiniAppIssue(message)) return false;
    return (
        hasAny(m, [
            'non riesco',
            'non posso',
            'non mi fa',
            'non funziona',
            'problema',
            'errore',
            'bloccato',
        ]) &&
        hasAny(m, ['indirizzo', 'sito', 'sul sito', 'pagina', 'checkout', 'form', 'campo', 'inserire'])
    );
}

export function buildWebsiteFormIssueReply(session: ChatSession): string {
    const name = displayFirstName(session);
    return (
        `Non si preoccupi, ${name}. Può scrivermi qui in chat l'indirizzo esatto e i dettagli della consegna ` +
        `(cimitero, tomba, data e orario): penserò io a inoltrare tutto al fiorista partner.`
    );
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
        return 'Grazie a te. Se serve altro, scrivimi pure.';
    }
    return 'Grazie a Lei. Se serve altro, scriva pure qui. 🌹';
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

/** Taglia il testo all'ultima frase completa, eliminando code incomplete da Gemini/Meta. */
export function trimIncompleteTail(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return trimmed;
    if (/[.!?…🌹]$/.test(trimmed)) return trimmed;

    for (const sep of ['. ', '.\n', '! ', '?\n', '? ', '…']) {
        const idx = trimmed.lastIndexOf(sep);
        if (idx >= Math.floor(trimmed.length * 0.35)) {
            return trimmed.slice(0, idx + 1).trim();
        }
    }

    let cleaned = trimmed.replace(
        /\s+(e|che|se|oppure|per|con|un|una|il|la|lo|dei|del|non|resto|desider|vedo)\s+\S{0,12}$/i,
        ''
    ).trim();

    const words = cleaned.split(/\s+/);
    const last = words[words.length - 1] || '';
    if (words.length > 2 && last.length <= 4 && !/[.!?]$/.test(last)) {
        cleaned = words.slice(0, -1).join(' ');
    }

    return cleaned.trim();
}

/** Risposta incompleta (troncata da Meta/Gemini o taglio catalogo). */
export function looksIncompleteReply(text: string): boolean {
    const trimmed = trimIncompleteTail(text).trim();
    if (trimmed.length < 12) return true;
    if (/https?:\/\/\S+$/.test(trimmed)) return false;
    if (/[.!?…🌹]$/.test(trimmed)) return false;
    if (/\b(desider|vedo che|se |oppure|per es|chrome o safari|resto a)\)?$/i.test(trimmed)) return true;
    const lastWord = trimmed.split(/\s+/).pop() || '';
    if (lastWord.length <= 3 && !/[.!?]$/.test(trimmed)) return true;
    return false;
}

export function repairIncompleteReply(text: string, userType: ChatSession['userType']): string {
    const trimmed = trimIncompleteTail(text);
    const base = trimmed.replace(/[,.\s]+$/, '').trim();
    if (/[.!?…🌹]$/.test(base)) return base;

    const suffix =
        userType === 'FLORIST'
            ? `Se la mini-app non risponde, può inviare le foto della posa direttamente qui in chat: le accettiamo come prova consegna.`
            : `Resto a Sua completa disposizione: mi scriva pure come posso aiutarLa.`;

    return `${base}. ${suffix}`;
}

/** Garantisce frasi complete prima dell'invio WhatsApp. */
export function finalizeVeraReplyText(text: string, userType: ChatSession['userType']): string {
    let result = trimIncompleteTail(text);
    if (looksIncompleteReply(result)) {
        result = repairIncompleteReply(result, userType);
    }
    return result.trim();
}

/**
 * Contestazione prezzo/compenso/cifra (Regola Aurea).
 * Perché: VERA non deve difendere il dato a sistema né litigare con la parola data.
 */
export function isEconomicDiscrepancyDispute(message: string): boolean {
    const m = normalize(message);
    const moneyTopic = hasAny(m, [
        'compenso',
        'prezzo',
        'pagamento',
        'pagarmi',
        'mi pagate',
        'cifra',
        'importo',
        'tariffa',
        'euro',
        '€',
        'accordo economico',
        'listino',
    ]);
    if (!moneyTopic) return false;
    return hasAny(m, [
        'sbagliat',
        'non torna',
        'non e',
        'non è',
        'doveva',
        'avete detto',
        'mi avevate',
        'mi avevano',
        'divers',
        'errat',
        'contest',
        'non corretto',
        'non corretto',
        'non corrisponde',
        'non coincide',
        'troppo bass',
        'troppo bass',
        'meno di',
        'di piu',
        'di più',
        'non mi torna',
    ]);
}

export function buildEconomicDiscrepancyReply(userType: ChatSession['userType']): string {
    if (userType === 'FLORIST') {
        return 'Verifico subito l’accordo economico per questo servizio/ordine e ti do conferma istantanea.';
    }
    return 'Verifico subito l’accordo economico per questo servizio/ordine e Le do conferma istantanea.';
}
