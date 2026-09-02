/**
 * Riconoscimento intenti cataloghi e link diretti VERA su WhatsApp.
 * Gestione deterministica immediata per richieste informative e di navigazione.
 */

import { getOpeningGreeting } from '@/lib/vera/greetings';
import { isOrderTrackingInquiry } from '@/lib/whatsapp/orderStatusInquiry';
import type { ChatSession } from '@/lib/chatStore';

export type CatalogLinkIntentType = 'funeral' | 'tombs' | 'pets' | 'assistance' | 'general';

function normalizeForCatalogMatch(value: string): string {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Verifica se un link al catalogo è già stato inviato nei messaggi recenti della sessione (ultimi 30 min).
 * Evita tassativamente il loop conversazionale del template statico ripetuto.
 */
export function hasRecentlySentCatalogLink(session?: ChatSession | null, targetUrlPart?: string): boolean {
    if (!session?.messages?.length) return false;
    const now = Date.now();
    const thirtyMinMs = 30 * 60 * 1000;

    const recentOutbounds = session.messages
        .filter((m) => m.direction === 'OUTBOUND')
        .slice(-6);

    for (const msg of recentOutbounds) {
        if (!msg.body) continue;
        const msgTime = msg.createdAt ? new Date(msg.createdAt).getTime() : NaN;
        if (!Number.isNaN(msgTime) && now - msgTime > thirtyMinMs) {
            continue;
        }
        if (targetUrlPart) {
            if (msg.body.includes(targetUrlPart)) return true;
        } else if (
            msg.body.includes('floremoria.com/per-il-funerale') ||
            msg.body.includes('floremoria.com/fiori-sulle-tombe') ||
            msg.body.includes('floremoria.com/piccoli-amici') ||
            msg.body.includes('floremoria.com/assistenza')
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Rileva se il messaggio dell'utente è una domanda di dettaglio, consulenziale o specifica
 * (prezzi, tipologie di fiori, colori, dimensioni, abbonamento, confronto) che deve essere
 * gestita dal dialogo conversazionale (Gemini / consulenza) e NON dal link statico.
 */
export function isConsultativeOrDetailQuestion(message: string): boolean {
    if (!message || typeof message !== 'string') return false;
    const m = normalizeForCatalogMatch(message);

    // Domande di dettaglio su fiori, colori, prezzi, abbonamenti o composizioni specifiche
    if (
        /\b(quanto costa|quanto viene|costo di|prezzo del|prezzo di|quali fiori|che fiori|che tipo|colori?|bianco|crema|rosa|rose|lilium|garofani?|composizion[ei]|misure|dimensioni?|copribara|cuscino|corona|cuore|piramide|bouquet|abbonament[oi]|mensil[ei]|settiman|ricorrenz|personalizz|biglietto|nastro|scrivere|differenz[ae]|consigli|oppure|entramb)\b/.test(
            m
        )
    ) {
        return true;
    }

    // Se c'è una domanda con punto interrogativo e parole su prodotti
    if (
        message.includes('?') &&
        /\b(cuscin|copribar|coron|cuore|piramid|bouquet|funeral|tomb|cimiter|posa|cerimoni|chiesa)\b/.test(
            m
        )
    ) {
        return true;
    }

    return false;
}

/**
 * Rileva se il messaggio è una richiesta esplicita di link o navigazione sito.
 */
export function detectCatalogLinkIntent(message: string): CatalogLinkIntentType | null {
    if (!message || typeof message !== 'string') return null;

    // Se è una domanda di dettaglio o consulenziale, lascia spazio al dialogo intelligente
    if (isConsultativeOrDetailQuestion(message)) return null;

    // Se l'utente sta chiedendo lo stato di un ordine specifico
    if (isOrderTrackingInquiry(message)) return null;
    if (/\b(?:ft|ff|fa|fp|pa|fm)-[a-z]{2}-\d{2}-\d{3,4}\b/i.test(message)) return null;

    const m = normalizeForCatalogMatch(message);
    if (!m) return null;

    // 1. Funerale / Camera Ardente / Cerimonia / Chiese / Lutto (Richiesta esplicita di catalogo o link)
    const isFuneralKeyword = /\b(funeral[ei]|camera\s+(?:ardente|mortuaria)|cerimoni[ae]|chies[ae]|rito|riti|trigesimo|condoglianz[ae]|cordoglio)\b/.test(
        m
    );
    const hasFuneralLinkIntent =
        isFuneralKeyword &&
        /\b(link|catalog(?:o|hi|he|a|i)?|sito|url|mandami|invia|vedere|dove\s+(?:posso|si\s+puo)\s+vedere)\b/.test(
            m
        );
    if (hasFuneralLinkIntent || (isFuneralKeyword && /\b(link|catalogo|sito)\b/.test(m))) {
        return 'funeral';
    }

    // 2. Fiori sulle Tombe / Cimitero / Loculo / Lapide (Richiesta esplicita di catalogo o link)
    const isTombsKeyword = /\b(tomb[ae]|cimiter[oi]|locul[oi]|lapid[ei]|fiori\s+sulle?\s+tomb[ae]|fiori\s+(?:al|in)\s+cimitero)\b/.test(
        m
    );
    const hasTombsLinkIntent =
        isTombsKeyword &&
        /\b(link|catalog(?:o|hi|he|a|i)?|sito|url|mandami|invia|vedere|dove\s+(?:posso|si\s+puo)\s+vedere)\b/.test(
            m
        );
    if (hasTombsLinkIntent || (isTombsKeyword && /\b(link|catalogo|sito)\b/.test(m))) {
        return 'tombs';
    }

    // 3. Piccoli Amici / Animali Domestici
    const isPetsKeyword = /\b(animal[ei]|can[ei]|gatt[oi]|piccoli\s+amici|pet|quattro\s+zampe)\b/.test(
        m
    );
    const hasPetsLinkIntent =
        isPetsKeyword &&
        /\b(link|catalog(?:o|hi|he|a|i)?|sito|url|mandami|invia|vedere|dove\s+(?:posso|si\s+puo)\s+vedere)\b/.test(
            m
        );
    if (hasPetsLinkIntent || (isPetsKeyword && /\b(link|catalogo|sito)\b/.test(m))) {
        return 'pets';
    }

    // 4. Assistenza / Contatti
    const isAssistanceKeyword = /\b(assistenza|contatt[oi]|contattare|parlare\s+con\s+(?:un\s+)?operatore|supporto\s+clienti|numero\s+assistenza|email\s+assistenza|link\s+assistenza)\b/.test(
        m
    );
    if (isAssistanceKeyword && /\b(link|pagina|sito|contatt|assistenza)\b/.test(m)) {
        return 'assistance';
    }

    // 5. Richiesta generale catalogo / sito / collezioni
    const isGeneralCatalog = /\b(catalog(?:o|hi|he|a|i)?|link\s+(?:al\s+)?sito|link\s+catalog|vedere\s+i\s+cataloghi|mandami\s+il\s+sito|url\s+sito)\b/.test(
        m
    );
    if (isGeneralCatalog) {
        return 'general';
    }

    return null;
}

/**
 * Costruisce la risposta deterministica per l'intento di catalogo rilevato,
 * mantenendo una formula di chiusura aperta e accogliente (senza commiato rigido).
 */
export function buildCatalogLinkReply(
    intent: CatalogLinkIntentType,
    displayName?: string | null,
    now: Date = new Date()
): string {
    const opening = getOpeningGreeting(displayName, now);

    switch (intent) {
        case 'funeral':
            return [
                opening,
                'ecco il link diretto al nostro catalogo dedicato:',
                'https://www.floremoria.com/per-il-funerale',
                '',
                'Qui troverà tutte le composizioni adatte a cerimonie, chiese e camere ardenti, con consegna garantita in anticipo e foto di conferma su WhatsApp.',
                'Resto a Sua disposizione per qualsiasi supporto nella scelta o per procedere insieme con l\'ordine.',
            ].join('\n');

        case 'tombs':
            return [
                opening,
                'ecco il link diretto al nostro catalogo per il cimitero:',
                'https://www.floremoria.com/fiori-sulle-tombe',
                '',
                'Qui troverà tutte le composizioni e i bouquet per tombe, loculi e lapidi, con posa accurata e foto di conferma prima e dopo su WhatsApp.',
                'Resto a Sua disposizione per qualsiasi supporto nella scelta o per procedere insieme con l\'ordine.',
            ].join('\n');

        case 'pets':
            return [
                opening,
                'ecco il link al catalogo dedicato ai Piccoli Amici:',
                'https://www.floremoria.com/piccoli-amici',
                '',
                'Qui troverà composizioni e omaggi pensati con affetto per il ricordo dei nostri compagni animali, con consegna curata e foto di conferma su WhatsApp.',
                'Resto a Sua disposizione per qualsiasi supporto o informazione.',
            ].join('\n');

        case 'assistance':
            return [
                opening,
                'ecco il link alla nostra pagina di assistenza:',
                'https://www.floremoria.com/assistenza',
                '',
                'Siamo a Sua completa disposizione tutti i giorni dalle 08:00 alle 22:00. Se preferisce, può scrivermi direttamente qui su WhatsApp o via email ad assistenza@floremoria.com.',
                'Resto a Sua disposizione per qualsiasi chiarimento.',
            ].join('\n');

        case 'general':
        default:
            return [
                opening,
                'ecco i link diretti ai nostri cataloghi dedicati:',
                '',
                '• Fiori per il Funerale: https://www.floremoria.com/per-il-funerale',
                '• Fiori sulle Tombe e Cimitero: https://www.floremoria.com/fiori-sulle-tombe',
                '• Piccoli Amici (Animali): https://www.floremoria.com/piccoli-amici',
                '',
                'Tutte le nostre composizioni includono la consegna curata e l\'invio della foto di conferma su WhatsApp.',
                'Resto a Sua disposizione per qualsiasi supporto nella scelta o per procedere insieme.',
            ].join('\n');
    }
}

/**
 * Tenta di generare una risposta immediata per intenti di link o catalogo.
 * Se il link è già stato inviato di recente nella conversazione o se l'utente sta chiedendo
 * dettagli specifici su prezzi/fiori/colori/abbonamento, restituisce null per dare spazio al dialogo consulenziale.
 */
export function tryBuildCatalogLinkReply(
    message: string,
    displayName?: string | null,
    now: Date = new Date(),
    session?: ChatSession | null
): string | null {
    // 1. Se è una domanda di dettaglio/consulenziale, non bloccare con template link
    if (isConsultativeOrDetailQuestion(message)) return null;

    // 2. Rileva l'intento di catalogo/link
    const intent = detectCatalogLinkIntent(message);
    if (!intent) return null;

    // 3. Se il link è già stato inviato di recente nella sessione, non ripeterlo in loop
    const targetUrlPart =
        intent === 'funeral'
            ? 'per-il-funerale'
            : intent === 'tombs'
            ? 'fiori-sulle-tombe'
            : intent === 'pets'
            ? 'piccoli-amici'
            : intent === 'assistance'
            ? 'assistenza'
            : undefined;

    if (hasRecentlySentCatalogLink(session, targetUrlPart)) {
        return null;
    }

    return buildCatalogLinkReply(intent, displayName, now);
}
