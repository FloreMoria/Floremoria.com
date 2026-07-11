import fs from 'node:fs';
import path from 'node:path';
import {
    buildHistoricalToneContext,
    resolveHistoricalAudience,
} from '@/lib/whatsapp/historicalToneKb';
import { isOrderTrackingInquiry } from '@/lib/whatsapp/orderStatusInquiry';
import { sanitizeWhatsAppDisplayName } from '@/lib/vera/displayName';
import {
    buildSymmetricCourtesyReply,
    isIsolatedCourtesyMessage,
} from '@/lib/vera/courtesyDebounce';

type CoreKb = {
    supportEmail: string;
    supportWhatsapp: string;
    supportHours: string;
    siteUrl: string;
    catalogTombsUrl: string;
    funeralUrl: string;
    petsUrl: string;
};

type ConversationMessage = {
    direction: 'INBOUND' | 'OUTBOUND';
    body: string;
    mediaUrl?: string;
    createdAt?: string;
};

let kbCache: CoreKb | null = null;
let historicalKbCache: string | null = null;
let historicalEssentialsCache: string | null = null;
let examplesKbCache: string | null = null;
export type CatalogIntent = 'tombs' | 'funeral' | 'pets' | 'general';

/** Link prodotto ufficiali (da knowledge_base_whatsapp.txt). */
const PRODUCT_LINKS: Record<string, string> = {
    'ricordo affettuoso': 'https://www.floremoria.com/fiori-sulle-tombe/bouquet-ricordo-affettuoso',
    'bouquet di rose': 'https://www.floremoria.com/fiori-sulle-tombe/bouquet-di-rose',
    'omaggio speciale': 'https://www.floremoria.com/fiori-sulle-tombe/bouquet-omaggio-speciale',
    'tributo eterno': 'https://www.floremoria.com/fiori-sulle-tombe/bouquet-tributo-eterno',
    'rispetto e vicinanza': 'https://www.floremoria.com/fiori-sulle-tombe/bouquet-rispetto-vicinanza',
    'cordoglio sincero': 'https://www.floremoria.com/fiori-sulle-tombe/bouquet-cordoglio-sincero',
    'omaggio solenne': 'https://www.floremoria.com/fiori-sulle-tombe/bouquet-omaggio-solenne',
    'memoria eterna': 'https://www.floremoria.com/fiori-sulle-tombe/bouquet-memoria-imperituri',
    'copribara': 'https://www.floremoria.com/fiori-sulle-tombe/copribara',
    'cuscino': 'https://www.floremoria.com/fiori-sulle-tombe/cuscino',
    'piramide': 'https://www.floremoria.com/fiori-sulle-tombe/piramide',
    'cuore': 'https://www.floremoria.com/fiori-sulle-tombe/cuore-corona',
    'corona': 'https://www.floremoria.com/fiori-sulle-tombe/cuore-corona',
    'un raggio di sole': 'https://www.floremoria.com/fiori-sulle-tombe/un-raggio-di-sole',
    'abbraccio verde': 'https://www.floremoria.com/fiori-sulle-tombe/abbraccio-verde',
    'legame eterno': 'https://www.floremoria.com/fiori-sulle-tombe/legame-eterno',
};

export const VERA_RESPECTFUL_OPENING =
    'La ringrazio per essersi rivolto a FloreMoria in un momento così delicato. Sono qui per aiutarLa a organizzare l\'omaggio con rispetto e serenità.';
export const STANDARD_GUIDANCE_MESSAGE =
    `${VERA_RESPECTFUL_OPENING}\n\n` +
    'Mi indichi se desidera un bouquet sulla tomba o un omaggio floreale per il funerale?\n\n' +
    'Catalogo tombe: https://www.floremoria.com/fiori-sulle-tombe\n' +
    'Funerale: https://www.floremoria.com/per-il-funerale';

function normalizeMessage(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasAny(haystack: string, needles: string[]): boolean {
    return needles.some((needle) => haystack.includes(needle));
}

function getDisplayName(userName: string): string {
    const trimmed = sanitizeWhatsAppDisplayName(userName);
    if (!trimmed) return '';
    const parts = trimmed.split(' ').filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return parts[parts.length - 1];
}

function extractLocationCandidate(message: string): string | null {
    const match = message.match(/\b(?:a|ad|in|presso)\s+([A-Za-zÀ-ÿ' -]{2,40})/i);
    if (!match?.[1]) return null;
    const candidate = match[1].trim().split(/\s+/).slice(0, 3).join(' ');
    if (candidate.length < 2) return null;
    return candidate
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function extractDateCandidate(message: string): string | null {
    const match = message.match(/\b(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\b/);
    return match?.[1] || null;
}

function looksHighlyFragmented(message: string, normalizedMessage: string): boolean {
    const raw = message.trim();
    if (raw.length < 18) return false;
    const words = normalizedMessage.split(' ').filter(Boolean);
    const hasNoPunctuation = !/[?.!,;:]/.test(raw);
    const manyWords = words.length >= 5;
    const tooManyTinyTokens = words.filter((w) => w.length <= 2).length >= Math.ceil(words.length * 0.45);
    return hasNoPunctuation && (manyWords || tooManyTinyTokens);
}

function inferRecentTopic(history: ConversationMessage[]): string | null {
    for (let i = history.length - 1; i >= 0; i -= 1) {
        const msg = normalizeMessage(history[i].body || '');
        if (!msg) continue;
        if (hasAny(msg, ['prezzo', 'prezzi', 'costo', 'costi', 'quanto costa', 'tariffa'])) return 'price';
        if (
            hasAny(msg, ['stato ordine', 'stato del mio ordine', 'dove si trova il mio ordine']) ||
            (msg.includes('ordine') && hasAny(msg, ['stato', 'aggiornamento', 'confermato', 'consegnato']))
        ) return 'status';
        if (hasAny(msg, ['foto', 'prova', 'prima dopo', 'prima e dopo'])) return 'photo';
        if (hasAny(msg, ['consegnate', 'consegnate a', 'copertura', 'in tutta italia', 'palermo', 'comune'])) return 'coverage';
        if (hasAny(msg, ['funerale', 'camera mortuaria', 'chiesa'])) return 'funeral';
        if (hasAny(msg, ['animali', 'animale', 'piccoli amici', 'pet'])) return 'pets';
        if (hasAny(msg, ['abbonamento', 'ricorrente', 'mensile', 'ogni mese'])) return 'subscription';
        if (hasAny(msg, ['pagamento', 'pagare', 'stripe', 'rimborso', 'reso'])) return 'payment';
    }
    return null;
}

function findLastOutboundMessage(history: ConversationMessage[]): string {
    for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i].direction === 'OUTBOUND' && history[i].body?.trim()) {
            return normalizeMessage(history[i].body);
        }
    }
    return '';
}

function findRecentInboundLocation(history: ConversationMessage[]): string | null {
    for (let i = history.length - 1; i >= 0; i -= 1) {
        const item = history[i];
        if (item.direction !== 'INBOUND') continue;
        const candidate = extractLocationCandidate(item.body || '');
        if (candidate) return candidate;
    }
    return null;
}

function isContextDependentMessage(normalizedMessage: string): boolean {
    const compact = normalizedMessage.replace(/\s+/g, ' ').trim();
    if (!compact) return false;
    const shortReplies = ['si', 'sì', 'ok', 'va bene', 'perfetto', 'certo', 'quello', 'questo', 'proceda', 'tomba', 'funerale'];
    if (shortReplies.includes(compact)) return true;
    return hasAny(compact, ['e quindi', 'e poi', 'e per', 'allora', 'come funziona', 'mi spiega meglio']);
}

function shouldUseDailyGreeting(history: ConversationMessage[]): boolean {
    const now = new Date();
    const greetedToday = history.some((msg) => {
        if (msg.direction !== 'OUTBOUND') return false;
        if (!normalizeMessage(msg.body || '').startsWith('buongiorno')) return false;
        if (!msg.createdAt) return true;
        const created = new Date(msg.createdAt);
        return (
            created.getFullYear() === now.getFullYear() &&
            created.getMonth() === now.getMonth() &&
            created.getDate() === now.getDate()
        );
    });
    return !greetedToday;
}

function extractLineValue(content: string, label: string, fallback: string): string {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`^-\\s*${escaped}:\\s*(.+)$`, 'm'));
    return match?.[1]?.trim() || fallback;
}

export function loadWhatsAppCoreKb(): CoreKb {
    if (kbCache) return kbCache;

    const kbPath = path.join(process.cwd(), 'docs', 'whatsapp', 'knowledge_base_whatsapp_core.txt');
    let content = '';
    try {
        content = fs.readFileSync(kbPath, 'utf-8');
    } catch {
        kbCache = {
            supportEmail: 'assistenza@floremoria.com',
            supportWhatsapp: '+39 3204105305',
            supportHours: '08:00-22:00',
            siteUrl: 'https://www.floremoria.com',
            catalogTombsUrl: 'https://www.floremoria.com/fiori-sulle-tombe',
            funeralUrl: 'https://www.floremoria.com/per-il-funerale',
            petsUrl: 'https://www.floremoria.com/per-animali-domestici',
        };
        return kbCache;
    }

    kbCache = {
        supportEmail: extractLineValue(content, 'Email assistenza', 'assistenza@floremoria.com'),
        supportWhatsapp: extractLineValue(content, 'WhatsApp assistenza', '+39 3204105305'),
        supportHours: extractLineValue(content, 'Orario assistenza', '08:00-22:00'),
        siteUrl: extractLineValue(content, 'Home', 'https://www.floremoria.com'),
        catalogTombsUrl: extractLineValue(content, 'Fiori sulle tombe', 'https://www.floremoria.com/fiori-sulle-tombe'),
        funeralUrl: extractLineValue(content, 'Fiori per il funerale', 'https://www.floremoria.com/per-il-funerale'),
        petsUrl: extractLineValue(content, 'Piccoli amici', 'https://www.floremoria.com/per-animali-domestici'),
    };
    return kbCache;
}

export function loadWhatsAppHistoricalKb(): string {
    if (historicalKbCache !== null) return historicalKbCache;
    const historicalKbPath = path.join(process.cwd(), 'docs', 'whatsapp', 'knowledge_base_whatsapp.txt');
    try {
        historicalKbCache = fs.readFileSync(historicalKbPath, 'utf-8');
    } catch {
        historicalKbCache = '';
    }
    return historicalKbCache;
}

/** Blocco URL catalogo per prompt LLM e risposte con link prodotto. */
export function buildWhatsAppProductLinksBlock(kb: CoreKb = loadWhatsAppCoreKb()): string {
    return [
        `Catalogo fiori sulle tombe (da EUR 29.99): ${kb.catalogTombsUrl}`,
        `Omaggi per il funerale: ${kb.funeralUrl}`,
        `Ricordo piccoli amici: ${kb.petsUrl}`,
        `Sito: ${kb.siteUrl}`,
    ].join('\n');
}

export function loadWhatsAppExamplesKb(): string {
    if (examplesKbCache !== null) return examplesKbCache;
    const examplesPath = path.join(process.cwd(), 'docs', 'whatsapp', 'knowledge_base_whatsapp_examples.txt');
    try {
        examplesKbCache = fs.readFileSync(examplesPath, 'utf-8');
    } catch {
        examplesKbCache = '';
    }
    return examplesKbCache;
}

/** Regole tono + cataloghi + link (senza le migliaia di chat storiche). */
export function extractHistoricalKbEssentials(): string {
    if (historicalEssentialsCache !== null) return historicalEssentialsCache;
    const full = loadWhatsAppHistoricalKb();
    if (!full) {
        historicalEssentialsCache = '';
        return historicalEssentialsCache;
    }
    const chapterMarker = 'CAPITOLO 1:';
    const idx = full.indexOf(chapterMarker);
    historicalEssentialsCache = (idx > 0 ? full.slice(0, idx) : full.slice(0, 14000)).trim();
    return historicalEssentialsCache;
}

function loadWhatsAppToneRulesFromCore(): string {
    const corePath = path.join(process.cwd(), 'docs', 'whatsapp', 'knowledge_base_whatsapp_core.txt');
    try {
        const content = fs.readFileSync(corePath, 'utf-8');
        const start = content.indexOf('5) REGOLE ASSISTENTE');
        const end = content.indexOf('==================================================\n7) RIMBORSI');
        if (start >= 0 && end > start) return content.slice(start, end).trim();
    } catch {
        /* ignore */
    }
    return '';
}

/** Contesto completo per Gemini: regole, cataloghi, link prodotto, esempi e chat storiche per registro. */
export function buildWhatsAppKnowledgeContext(
    userType: 'UTENTE' | 'FLORIST' | 'UNKNOWN' = 'UTENTE'
): string {
    const kb = loadWhatsAppCoreKb();
    const audience = resolveHistoricalAudience(userType);
    return [
        '=== REGOLE E TONO (OBBLIGATORIE) ===',
        loadWhatsAppToneRulesFromCore(),
        '',
        '=== PRINCIPIO ===',
        'Accompagnare ogni gesto con rispetto e semplicità. Facilitare sempre l\'azione concreta tramite link pertinenti.',
        'ROUTING MESSAGGI (tassativo): i template Meta rigidi sono SOLO per il primo messaggio outbound (notifica / avvio conversazione).',
        'Con finestra conversazione attiva (risposta utente o fiorista entro 24h), ogni messaggio di testo in entrata è gestito da Gemini: risposta umana, elastica e contestuale — mai script fissi tipo "invia la foto".',
        'TONE OF VOICE (tassativo): Massima empatia, garbo, gentilezza e rispetto assoluto del contesto del ricordo. Mai sembrare un bot aziendale freddo.',
        'Tono: gentile, educato, caloroso e rispettoso del lutto e della commemorazione. Usare sempre il Lei con gli utenti finali.',
        'Link a foto di consegna o testimonianze: presentarli come cura e vicinanza al ricordo, non come notifica automatica.',
        '',
        buildHistoricalToneContext(audience),
        '',
        '=== CONTATTI ===',
        `- Email: ${kb.supportEmail}`,
        `- WhatsApp: ${kb.supportWhatsapp}`,
        `- Orario: ${kb.supportHours}`,
        '',
        '=== CATALOGHI E LINK UFFICIALI ===',
        extractHistoricalKbEssentials(),
        '',
        '=== ESEMPI CONVERSAZIONALI SINTETICI ===',
        loadWhatsAppExamplesKb(),
    ]
        .filter(Boolean)
        .join('\n');
}

export function inferCatalogIntent(
    message: string,
    history: ConversationMessage[] = []
): CatalogIntent | null {
    if (isOrderTrackingInquiry(message)) return null;

    const combined = [message, ...history.slice(-4).map((h) => h.body)].join(' ');
    const m = normalizeMessage(combined);
    if (
        hasAny(m, [
            'funerale',
            'camera mortuaria',
            'chiesa',
            'copribara',
            'cuscino',
            'piramide',
            'corona',
            'cordoglio',
        ])
    ) {
        return 'funeral';
    }
    if (hasAny(m, ['animale', 'animali', 'pet', 'piccoli amici', 'cane', 'gatto'])) {
        return 'pets';
    }
    if (
        hasAny(m, [
            'tomba',
            'cimitero',
            'bouquet',
            'fiori',
            'lumino',
            'prezzo',
            'prezzi',
            'costa',
            'catalogo',
            'comprare',
            'ordinare',
            'omaggio',
            'ricordo',
            'commemor',
            'lutto',
            'defunto',
            'caro',
            'cara',
            'vorrei',
            'voglio',
            'servono',
        ])
    ) {
        return 'tombs';
    }
    return null;
}

function findMentionedProductLink(text: string): string | null {
    const m = normalizeMessage(text);
    for (const [name, url] of Object.entries(PRODUCT_LINKS)) {
        if (m.includes(normalizeMessage(name))) return url;
    }
    return null;
}

/** Garantisce link catalogo/prodotto se la risposta ne è priva ma il contesto lo richiede. */
export function ensureCatalogLinksInReply(
    reply: string,
    message: string,
    history: ConversationMessage[] = [],
    options?: { userType?: 'UTENTE' | 'FLORIST' | 'UNKNOWN'; skipCatalog?: boolean }
): string {
    if (options?.skipCatalog || options?.userType === 'FLORIST') return reply;
    if (isClosingMessage(message)) return reply;
    if (isOrderTrackingInquiry(message)) return reply;

    const trimmed = reply.trim();
    if (!trimmed || !/[.!?…🌹]$/.test(trimmed)) return reply;

    if (/https?:\/\/\S*floremoria\.com/i.test(reply)) return reply;

    const m = normalizeMessage(message);
    if (m === 'foto' || m === 'immagine' || m === 'allegato') return reply;

    const kb = loadWhatsAppCoreKb();
    const contextText = [message, ...history.slice(-3).map((h) => h.body)].join(' ');
    const productLink = findMentionedProductLink(contextText);
    if (productLink) {
        return `${reply}\n\nPuò vedere il prodotto qui:\n${productLink}`;
    }

    const intent = inferCatalogIntent(message, history);
    if (!intent) return reply;

    const lines: string[] = [];
    if (intent === 'tombs' || intent === 'general') {
        lines.push(`Catalogo fiori sulle tombe: ${kb.catalogTombsUrl}`);
    }
    if (intent === 'funeral' || intent === 'general') {
        lines.push(`Omaggi per il funerale: ${kb.funeralUrl}`);
    }
    if (intent === 'pets') {
        lines.push(`Ricordo piccoli amici: ${kb.petsUrl}`);
    }

    return `${reply}\n\n${lines.join('\n')}`;
}

export function ensureRespectfulOpening(reply: string, hasPriorOutbound: boolean, displayName?: string): string {
    if (hasPriorOutbound) return reply;
    const lower = reply.toLowerCase();
    if (
        lower.includes('ringrazio per essersi rivolto') ||
        lower.includes('momento cos') ||
        lower.includes('condoglianze') ||
        lower.startsWith('buongiorno') ||
        lower.startsWith('gentile ')
    ) {
        return reply;
    }
    const safeName = sanitizeWhatsAppDisplayName(displayName);
    const greeting = safeName ? `Buongiorno ${safeName}, ` : 'Buongiorno, ';
    return `${greeting}${VERA_RESPECTFUL_OPENING}\n\n${reply}`;
}

export function isSimpleThanksMessage(message: string): boolean {
    return isIsolatedCourtesyMessage(message) && /grazie|ringrazio/.test(normalizeMessage(message));
}

export function isClosingMessage(message: string): boolean {
    const m = normalizeMessage(message);
    return ['arrivederci', 'a presto', 'buona notte', 'buona serata', 'buona giornata', 'a risentirci'].some(
        (phrase) => m === phrase || m.startsWith(`${phrase} `)
    );
}

export function buildSimpleThanksReply(): string {
    return 'Di nulla. Siamo vicini a Lei in questo momento delicato.';
}

export function buildWhatsAppAiReply(params: {
    message: string;
    userName: string;
    userType: 'UTENTE' | 'FLORIST' | 'UNKNOWN';
    mediaUrl?: string | null;
    history?: ConversationMessage[];
    systemPrompt?: string;
    knowledgeContext?: string;
}): string {
    const { message, userName, userType, mediaUrl, history = [] } = params;
    const kb = loadWhatsAppCoreKb();
    const m = normalizeMessage(message);
    const recentTopic = inferRecentTopic(history);
    const lastOutboundMessage = findLastOutboundMessage(history);
    const recentInboundLocation = findRecentInboundLocation(history);
    const contextDependent = isContextDependentMessage(m);
    const displayName = getDisplayName(userName);
    const salutoPrefix = shouldUseDailyGreeting(history)
        ? (displayName ? `Buongiorno ${displayName}, ` : 'Buongiorno, ')
        : '';
    const emotionalContext = hasAny(m, [
        'sconforto',
        'triste',
        'tristezza',
        'dolore',
        'sto male',
        'piango',
        'mi manca',
        'angoscia',
        'sono in crisi',
        'confuso',
        'confusa',
        'disorientato',
        'disorientata',
        'non ce la faccio',
        'lutto',
        'cordoglio',
        'commemor',
        'defunto',
        'decedut',
        'mort',
        'mancat',
        'caro',
        'cara',
        'mamma',
        'papa',
        'nonno',
        'nonna',
    ]);
    const emotionalPrefix =
        emotionalContext && !salutoPrefix && !hasAny(m, ['condoglianze'])
            ? `${VERA_RESPECTFUL_OPENING} `
            : '';

    if (userType === 'FLORIST') {
        // Fuori finestra 24h / fallback: nessuno script rigido; il router VERA usa Gemini in chat aperta.
        return buildSymmetricCourtesyReply({ message, userType: 'FLORIST', displayName });
    }

    if (isIsolatedCourtesyMessage(message)) {
        return buildSymmetricCourtesyReply({ message, userType, displayName });
    }

    // Lutto: organizzazione omaggio floreale
    if (
        hasAny(m, ['mort', 'mancat', 'decedut']) &&
        hasAny(m, ['fiori', 'organizzare', 'omaggio', 'vorrei', 'voglio'])
    ) {
        const kin = hasAny(m, ['nonna', 'nonno'])
            ? 'Sua nonna'
            : hasAny(m, ['mamma'])
              ? 'Sua mamma'
              : 'il Suo caro';
        return `${salutoPrefix}Le porgo le mie sincere condoglianze. Per organizzare l'omaggio floreale per ${kin}, può consultare le composizioni per il funerale:\n${kb.funeralUrl}\n\nQuando desidera, mi indichi città e luogo della cerimonia: La seguirò con calma, passo dopo passo.`;
    }

    // Lutto recente / improvviso (es. "è morta stamattina")
    if (
        hasAny(m, ['mort', 'mancat', 'decedut']) &&
        hasAny(m, ['stamattina', 'oggi', 'poco fa', 'improvvis', 'stanotte', 'proprio'])
    ) {
        return `Le porgo le mie più sincere condoglianze per questa dolorosa perdita. Può scegliere l'omaggio per il funerale qui:\n${kb.funeralUrl}\n\nSiamo disponibili ${kb.supportHours} per aiutarLa con serenità.`;
    }

    if ((m.includes('tomba') || m.includes('cimitero')) && !m.includes('funerale')) {
        return `${salutoPrefix}Se vuole farci posare il suo omaggio floreale su una tomba in qualsiasi cimitero d'Italia, puo farlo da qui: ${kb.catalogTombsUrl}`;
    }

    if (contextDependent && recentTopic === 'price') {
        return `${salutoPrefix}Riprendo il punto precedente: per i tributi floreali sulla tomba partiamo da EUR 29.99. Può consultare il catalogo qui: ${kb.catalogTombsUrl}`;
    }
    if (contextDependent && recentTopic === 'coverage') {
        return `${salutoPrefix}Confermo che copriamo tutta Italia, anche comuni piccoli. Se vuole, mi indichi il comune e Le confermo subito la copertura.`;
    }
    if (contextDependent && recentTopic === 'funeral') {
        return `${salutoPrefix}Per l'omaggio floreale per il funerale, puo procedere da qui: ${kb.funeralUrl}`;
    }
    if (contextDependent && recentTopic === 'pets') {
        return `${salutoPrefix}Per il ricordo dei piccoli amici, puo procedere da qui: ${kb.petsUrl}`;
    }
    if (contextDependent && recentTopic === 'status') {
        return `${salutoPrefix}Per lo stato ordine La aggiorniamo in chat e, a consegna conclusa, Le inviamo la testimonianza fotografica su WhatsApp.`;
    }
    if (contextDependent && recentTopic === 'photo') {
        return `${salutoPrefix}Le confermo che inviamo la testimonianza fotografica del tributo floreale sul posto, con la massima trasparenza.`;
    }
    if (contextDependent && recentTopic === 'subscription') {
        return `${salutoPrefix}Possiamo attivare la consegna ricorrente mensile con testimonianza fotografica a ogni consegna.`;
    }
    if (contextDependent && recentTopic === 'payment') {
        return `${salutoPrefix}I pagamenti sono tracciati e sicuri; per segnalazioni valide, la pratica di rimborso si avvia entro 24h.`;
    }
    if (
        hasAny(lastOutboundMessage, ['tributo sulla tomba oppure un omaggio solenne', 'tributo sulla tomba o un omaggio solenne', 'bouquet sulla tomba', 'omaggio floreale']) &&
        m.includes('tomba')
    ) {
        if (recentInboundLocation) {
            return `${salutoPrefix}Perfetto, procediamo con un bouquet sulla tomba. Per conferma: desidera la consegna nell'area di ${recentInboundLocation}?\n\nCatalogo: ${kb.catalogTombsUrl}`;
        }
        return `${salutoPrefix}Perfetto, procediamo con un bouquet sulla tomba. Per aiutarLa con precisione Le chiedo un solo dettaglio: in quale comune o cimitero desidera la consegna?\n\nNel frattempo può scegliere il bouquet qui: ${kb.catalogTombsUrl}`;
    }
    if (
        hasAny(lastOutboundMessage, ['tributo sulla tomba oppure un omaggio solenne', 'tributo sulla tomba o un omaggio solenne', 'bouquet sulla tomba', 'omaggio floreale']) &&
        m.includes('funerale')
    ) {
        return `${salutoPrefix}Perfetto, procediamo con un omaggio floreale per il funerale. Per aiutarLa con precisione Le chiedo un solo dettaglio: in quale citta e luogo desidera la consegna?\n\nPuò scegliere l'omaggio qui: ${kb.funeralUrl}`;
    }

    if (hasAny(m, ['prezzo', 'prezzi', 'costo', 'costi', 'quanto costa', 'tariffa'])) {
        return `${salutoPrefix}${emotionalPrefix}Per i tributi floreali sulla tomba partiamo da EUR 29.99. Può consultare tutte le opzioni qui: ${kb.catalogTombsUrl}\nPer il funerale: ${kb.funeralUrl}`;
    }

    if (
        hasAny(m, ['stato ordine', 'stato del mio ordine', 'dove si trova il mio ordine']) ||
        (m.includes('ordine') && hasAny(m, ['stato', 'aggiornamento', 'confermato', 'consegnato']))
    ) {
        return `${salutoPrefix}${emotionalPrefix}La aggiorniamo volentieri sullo stato ordine. Le consegne sono gestite da fioristi partner locali e, a esecuzione completata, Le inviamo la testimonianza fotografica su WhatsApp.`;
    }

    if (hasAny(m, ['foto', 'prova', 'prima dopo', 'prima e dopo'])) {
        return `${salutoPrefix}${emotionalPrefix}Sarà nostra cura inviarLe la testimonianza fotografica del tributo floreale sul posto, per garantirLe la massima vicinanza alla memoria del Suo caro. Se desidera, possiamo richiedere anche la foto prima/dopo quando disponibile.`;
    }

    if (hasAny(m, ['consegnate', 'consegnate a', 'copertura', 'in tutta italia', 'palermo', 'comune'])) {
        return `${salutoPrefix}${emotionalPrefix}Copriamo tutta Italia, anche nei comuni piu piccoli. Se desidera, mi scriva il comune e Le confermo subito la copertura.`;
    }

    if (hasAny(m, ['funerale', 'camera mortuaria', 'chiesa'])) {
        return `${salutoPrefix}${emotionalPrefix}Se desidera un omaggio floreale per il funerale, può procedere da qui: ${kb.funeralUrl}`;
    }

    if (hasAny(m, ['animali', 'animale', 'piccoli amici', 'pet'])) {
        return `${salutoPrefix}${emotionalPrefix}Per il ricordo dei piccoli amici, può procedere da qui: ${kb.petsUrl}`;
    }

    if (hasAny(m, ['abbonamento', 'ricorrente', 'mensile', 'ogni mese'])) {
        return `${salutoPrefix}${emotionalPrefix}Possiamo attivare una consegna ricorrente mensile, con testimonianza fotografica a ogni consegna. Desidera che La guidi passo per passo?`;
    }

    if (hasAny(m, ['quando consegnate', 'tempi', 'entro quanto', '48 ore', 'quanto ci vuole'])) {
        return `${salutoPrefix}${emotionalPrefix}In genere consegniamo entro 48 ore, salvo meteo o vincoli operativi del cimitero. La aggiorniamo sempre su WhatsApp.`;
    }

    if (hasAny(m, ['pagamento', 'pagare', 'stripe', 'rimborso', 'reso'])) {
        return `${salutoPrefix}${emotionalPrefix}I pagamenti sono tracciati e sicuri. In caso di segnalazione valida, avviamo la pratica di reso/rimborso entro 24h; l'accredito puo richiedere fino a circa 7 giorni bancari.`;
    }

    if (hasAny(m, ['assistenza', 'contatto', 'email', 'whatsapp'])) {
        return `${salutoPrefix}${emotionalPrefix}Siamo disponibili ${kb.supportHours}. Se desidera, La metto subito in contatto con lo staff umano.`;
    }

    if (emotionalContext) {
        return `${salutoPrefix}${emotionalPrefix}Mi dica pure come posso aiutarLa: desidera un omaggio per il funerale o un bouquet sulla tomba?\n\nFunerale: ${kb.funeralUrl}\nTombe: ${kb.catalogTombsUrl}`;
    }

    if (
        hasAny(m, [
            'fiori',
            'bouquet',
            'omaggio',
            'vorrei',
            'voglio',
            'comprare',
            'ordinare',
            'servono',
            'ricordo',
            'commemor',
        ])
    ) {
        return `${salutoPrefix}${emotionalPrefix}Con cura e rispetto, può scegliere l'omaggio più adatto:\n\nTombe: ${kb.catalogTombsUrl}\nFunerale: ${kb.funeralUrl}`;
    }

    if (looksHighlyFragmented(message, m)) {
        const locationCandidate = extractLocationCandidate(message);
        if (locationCandidate) {
            return `La ringrazio. Per essere certa di aiutarLa al meglio: desidera che l'omaggio floreale venga consegnato a ${locationCandidate}?`;
        }
        const dateCandidate = extractDateCandidate(message);
        if (dateCandidate) {
            return `La ringrazio. Per essere certa di aiutarLa al meglio: desidera la consegna in data ${dateCandidate}?`;
        }
        return STANDARD_GUIDANCE_MESSAGE;
    }

    return STANDARD_GUIDANCE_MESSAGE;
}
