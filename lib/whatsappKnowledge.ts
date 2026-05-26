import fs from 'node:fs';
import path from 'node:path';

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
};

let kbCache: CoreKb | null = null;

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
    const trimmed = userName.trim();
    if (!trimmed || trimmed.startsWith('+') || trimmed.startsWith('whatsapp:')) return '';
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

export function buildWhatsAppAiReply(params: {
    message: string;
    userName: string;
    userType: 'UTENTE' | 'FLORIST' | 'UNKNOWN';
    mediaUrl?: string | null;
    history?: ConversationMessage[];
}): string {
    const { message, userName, userType, mediaUrl, history = [] } = params;
    const kb = loadWhatsAppCoreKb();
    const m = normalizeMessage(message);
    const recentTopic = inferRecentTopic(history);
    const lastOutboundMessage = findLastOutboundMessage(history);
    const recentInboundLocation = findRecentInboundLocation(history);
    const contextDependent = isContextDependentMessage(m);
    const displayName = getDisplayName(userName);
    const saluto = displayName ? `Buongiorno ${displayName},` : 'Buongiorno,';
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
    ]);
    const emotionalPrefix = emotionalContext
        ? 'La ringrazio per essersi rivolto a FloreMoria in un momento cosi delicato. Sono qui per aiutarLa a organizzare l\'omaggio nel modo piu sereno possibile. '
        : '';

    if (userType === 'FLORIST') {
        if (mediaUrl) {
            return `Grazie, foto ricevuta correttamente. La sto registrando nel flusso consegna FloreMoria. Se puoi, indica anche il numero ordine nel formato FT-XX-YY-001 per associare la prova in modo preciso.`;
        }
        return `Buongiorno, per favore invii la foto della posa e il numero ordine (es. FT-XX-YY-001). Appena arriva, la registriamo subito in dashboard.`;
    }

    if (contextDependent && recentTopic === 'price') {
        return `${saluto} riprendo il punto precedente: per i tributi floreali sulla tomba partiamo da EUR 29.99. Se desidera, puo consultare il catalogo ufficiale qui: ${kb.catalogTombsUrl}`;
    }
    if (contextDependent && recentTopic === 'coverage') {
        return `${saluto} certo. Confermo che copriamo tutta Italia, anche comuni piccoli. Se desidera, puo iniziare da qui: ${kb.catalogTombsUrl}`;
    }
    if (contextDependent && recentTopic === 'funeral') {
        return `${saluto} certo. Proseguendo da quanto ci siamo detti, per l'Omaggio Solenne in ambito funerale trova i servizi qui: ${kb.funeralUrl}`;
    }
    if (contextDependent && recentTopic === 'pets') {
        return `${saluto} certamente. Per il ricordo dei piccoli amici puo consultare il catalogo qui: ${kb.petsUrl}`;
    }
    if (contextDependent && recentTopic === 'status') {
        return `${saluto} certamente. Per lo stato ordine La aggiorniamo in chat e, a consegna conclusa, Le inviamo la testimonianza fotografica su WhatsApp.`;
    }
    if (contextDependent && recentTopic === 'photo') {
        return `${saluto} certamente. Le confermo che inviamo la testimonianza fotografica del tributo floreale sul posto, con la massima trasparenza.`;
    }
    if (contextDependent && recentTopic === 'subscription') {
        return `${saluto} certamente. Possiamo attivare la consegna ricorrente mensile con testimonianza fotografica a ogni consegna.`;
    }
    if (contextDependent && recentTopic === 'payment') {
        return `${saluto} certamente. I pagamenti sono tracciati e sicuri; per segnalazioni valide, la pratica di rimborso si avvia entro 24h.`;
    }
    if (
        hasAny(lastOutboundMessage, ['tributo sulla tomba oppure un omaggio solenne', 'tributo sulla tomba o un omaggio solenne']) &&
        m.includes('tomba')
    ) {
        if (recentInboundLocation) {
            return `${saluto} perfetto, procediamo con un Tributo sulla tomba. Per conferma: desidera la consegna nell'area di ${recentInboundLocation}?`;
        }
        return `${saluto} perfetto, procediamo con un Tributo sulla tomba. Per aiutarLa con precisione Le chiedo un solo dettaglio: in quale comune o cimitero desidera la consegna?`;
    }
    if (
        hasAny(lastOutboundMessage, ['tributo sulla tomba oppure un omaggio solenne', 'tributo sulla tomba o un omaggio solenne']) &&
        m.includes('funerale')
    ) {
        return `${saluto} perfetto, procediamo con un Omaggio Solenne per il funerale. Per aiutarLa con precisione Le chiedo un solo dettaglio: in quale citta e luogo desidera la consegna?`;
    }

    if (hasAny(m, ['prezzo', 'prezzi', 'costo', 'costi', 'quanto costa', 'tariffa'])) {
        return `${saluto} ${emotionalPrefix}per i tributi floreali sulla tomba partiamo da EUR 29.99. Se desidera, puo consultare il catalogo ufficiale qui: ${kb.catalogTombsUrl}`;
    }

    if (
        hasAny(m, ['stato ordine', 'stato del mio ordine', 'dove si trova il mio ordine']) ||
        (m.includes('ordine') && hasAny(m, ['stato', 'aggiornamento', 'confermato', 'consegnato']))
    ) {
        return `${saluto} ${emotionalPrefix}La aggiorniamo volentieri sullo stato ordine. Le consegne sono gestite da fioristi partner locali e, a esecuzione completata, Le inviamo la testimonianza fotografica su WhatsApp.`;
    }

    if (hasAny(m, ['foto', 'prova', 'prima dopo', 'prima e dopo'])) {
        return `${saluto} ${emotionalPrefix}sara nostra cura inviarLe la testimonianza fotografica del tributo floreale sul posto, per garantirLe la massima vicinanza alla memoria del Suo caro. Se desidera, possiamo richiedere anche la foto prima/dopo quando disponibile.`;
    }

    if (hasAny(m, ['consegnate', 'consegnate a', 'copertura', 'in tutta italia', 'palermo', 'comune'])) {
        return `${saluto} ${emotionalPrefix}copriamo tutta Italia, anche nei comuni piu piccoli. Se desidera, puo iniziare da qui: ${kb.catalogTombsUrl}`;
    }

    if (hasAny(m, ['funerale', 'camera mortuaria', 'chiesa'])) {
        return `${saluto} ${emotionalPrefix}per l'Omaggio Solenne in ambito funerale trova i servizi ufficiali qui: ${kb.funeralUrl}`;
    }

    if (hasAny(m, ['animali', 'animale', 'piccoli amici', 'pet'])) {
        return `${saluto} ${emotionalPrefix}per il ricordo dei piccoli amici puo consultare il catalogo qui: ${kb.petsUrl}`;
    }

    if (hasAny(m, ['abbonamento', 'ricorrente', 'mensile', 'ogni mese'])) {
        return `${saluto} ${emotionalPrefix}possiamo attivare una consegna ricorrente mensile, con testimonianza fotografica a ogni consegna. Desidera che La guidi passo per passo?`;
    }

    if (hasAny(m, ['quando consegnate', 'tempi', 'entro quanto', '48 ore', 'quanto ci vuole'])) {
        return `${saluto} ${emotionalPrefix}in genere consegniamo entro 48 ore, salvo meteo o vincoli operativi del cimitero. La aggiorniamo sempre su WhatsApp.`;
    }

    if (hasAny(m, ['pagamento', 'pagare', 'stripe', 'rimborso', 'reso'])) {
        return `${saluto} ${emotionalPrefix}i pagamenti sono tracciati e sicuri. In caso di segnalazione valida, avviamo la pratica di reso/rimborso entro 24h; l'accredito puo richiedere fino a circa 7 giorni bancari.`;
    }

    if (hasAny(m, ['assistenza', 'contatto', 'email', 'whatsapp'])) {
        return `${saluto} ${emotionalPrefix}puo contattarci a ${kb.supportEmail} oppure su WhatsApp ${kb.supportWhatsapp}. Siamo disponibili ${kb.supportHours}.`;
    }

    if (emotionalContext) {
        return `${saluto} ${emotionalPrefix}Per aiutarLa al meglio, preferisce organizzare un Tributo sulla tomba oppure un Omaggio Solenne per il funerale?`;
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
        return `La ringrazio. Per aiutarLa con precisione Le chiedo un solo dettaglio: desidera organizzare un Tributo sulla tomba o un Omaggio Solenne per il funerale?`;
    }

    return `${saluto} sono VERA, assistenza virtuale FloreMoria. Posso aiutarLa con ordini, consegne, testimonianza fotografica e catalogo. Se desidera un operatore umano, scriva UMANO. Assistenza ${kb.supportHours}.`;
}
