/**
 * Riconoscimento intenti cataloghi e link diretti VERA su WhatsApp.
 * Gestione deterministica immediata per richieste informative e di navigazione.
 */

import { getClosingGreeting, getOpeningGreeting } from '@/lib/vera/greetings';
import { isOrderTrackingInquiry } from '@/lib/whatsapp/orderStatusInquiry';

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
 * Rileva se il messaggio è una richiesta esplicita o implicita di catalogo/link del sito.
 */
export function detectCatalogLinkIntent(message: string): CatalogLinkIntentType | null {
    if (!message || typeof message !== 'string') return null;

    // Se l'utente sta chiedendo lo stato di un ordine specifico, non è una richiesta di catalogo
    if (isOrderTrackingInquiry(message)) return null;
    if (/\b(?:ft|ff|fa|fp|pa|fm)-[a-z]{2}-\d{2}-\d{3,4}\b/i.test(message)) return null;

    const m = normalizeForCatalogMatch(message);
    if (!m) return null;

    // 1. Funerale / Camera Ardente / Cerimonia / Chiese / Lutto
    const isFuneralKeyword = /\b(funeral[ei]|camera\s+(?:ardente|mortuaria)|cerimoni[ae]|chies[ae]|rito|riti|trigesimo|copribara|cuscin[oi]|coron[ae]|condoglianz[ae]|cordoglio)\b/.test(
        m
    );
    const hasFuneralLinkIntent =
        isFuneralKeyword &&
        /\b(link|catalog(?:o|hi|he|a|i)?|fiori|omaggi?|vedere|inviare|mandare|prezz[io]|cost[io]|informazion[ei]|info|aiuto|supporto|volevo|vorrei|serve|posso|ordinare|acquistare)\b/.test(
            m
        );
    if (isFuneralKeyword && (hasFuneralLinkIntent || m.length <= 60)) {
        return 'funeral';
    }

    // 2. Fiori sulle Tombe / Cimitero / Loculo / Lapide
    const isTombsKeyword = /\b(tomb[ae]|cimiter[oi]|locul[oi]|lapid[ei]|fiori\s+sulle?\s+tomb[ae]|fiori\s+(?:al|in)\s+cimitero)\b/.test(
        m
    );
    const hasTombsLinkIntent =
        isTombsKeyword &&
        /\b(link|catalog(?:o|hi|he|a|i)?|fiori|bouquet|omaggi?|vedere|posa|pulizia|prezz[io]|cost[io]|informazion[ei]|info|aiuto|supporto|volevo|vorrei|serve|posso|ordinare|acquistare)\b/.test(
            m
        );
    if (isTombsKeyword && (hasTombsLinkIntent || m.length <= 60)) {
        return 'tombs';
    }

    // 3. Piccoli Amici / Animali Domestici
    const isPetsKeyword = /\b(animal[ei]|can[ei]|gatt[oi]|piccoli\s+amici|pet|quattro\s+zampe)\b/.test(
        m
    );
    const hasPetsLinkIntent =
        isPetsKeyword &&
        /\b(link|catalog(?:o|hi|he|a|i)?|fiori|omaggi?|vedere|inviare|mandare|prezz[io]|cost[io]|informazion[ei]|info|aiuto|supporto|volevo|vorrei|serve|posso|ordinare|acquistare)\b/.test(
            m
        );
    if (isPetsKeyword && (hasPetsLinkIntent || m.length <= 60)) {
        return 'pets';
    }

    // 4. Assistenza / Contatti
    const isAssistanceKeyword = /\b(assistenza|contatt[oi]|contattare|parlare\s+con\s+(?:un\s+)?operatore|supporto\s+clienti|numero\s+assistenza|email\s+assistenza|link\s+assistenza)\b/.test(
        m
    );
    if (isAssistanceKeyword) {
        return 'assistance';
    }

    // 5. Richiesta generale catalogo / sito / collezioni
    const isGeneralCatalog = /\b(catalog(?:o|hi|he|a|i)?|link\s+(?:al\s+)?sito|tutti\s+i\s+fiori|vedere\s+i\s+fiori|vostri\s+fiori|collezion[ei]|listin[oi]|cosa\s+offrite)\b/.test(
        m
    );
    if (isGeneralCatalog) {
        return 'general';
    }

    return null;
}

/**
 * Costruisce la risposta deterministica per l'intento di catalogo rilevato,
 * applicando tassativamente le regole orarie Europe/Rome e il nome in Title Case.
 */
export function buildCatalogLinkReply(
    intent: CatalogLinkIntentType,
    displayName?: string | null,
    now: Date = new Date()
): string {
    const opening = getOpeningGreeting(displayName, now);
    const closing = getClosingGreeting(displayName, now);

    switch (intent) {
        case 'funeral':
            return [
                opening,
                'ecco il link diretto al nostro catalogo dedicato:',
                'https://www.floremoria.com/per-il-funerale',
                '',
                'Qui troverà tutte le composizioni adatte a cerimonie, chiese e camere ardenti, con consegna garantita in anticipo e foto di conferma su WhatsApp.',
                'Resto a Sua disposizione se desidera supporto nella scelta.',
                closing,
            ].join('\n');

        case 'tombs':
            return [
                opening,
                'ecco il link diretto al nostro catalogo per il cimitero:',
                'https://www.floremoria.com/fiori-sulle-tombe',
                '',
                'Qui troverà tutte le composizioni e i bouquet per tombe, loculi e lapidi, con posa accurata e foto di conferma prima e dopo su WhatsApp.',
                'Resto a Sua disposizione se desidera supporto nella scelta.',
                closing,
            ].join('\n');

        case 'pets':
            return [
                opening,
                'ecco il link al catalogo dedicato ai Piccoli Amici:',
                'https://www.floremoria.com/piccoli-amici',
                '',
                'Qui troverà composizioni e omaggi pensati con affetto per il ricordo dei nostri compagni animali, con consegna curata e foto di conferma su WhatsApp.',
                'Resto a Sua disposizione se desidera supporto nella scelta.',
                closing,
            ].join('\n');

        case 'assistance':
            return [
                opening,
                'ecco il link alla nostra pagina di assistenza:',
                'https://www.floremoria.com/assistenza',
                '',
                'Siamo a Sua completa disposizione tutti i giorni dalle 08:00 alle 22:00. Se preferisce, può scrivermi direttamente qui su WhatsApp o via email ad assistenza@floremoria.com.',
                'Resto a Sua disposizione per qualsiasi chiarimento.',
                closing,
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
                'Tutte le nostre composizioni includono la consegna garantita e l\'invio della foto di conferma su WhatsApp.',
                'Resto a Sua disposizione se desidera supporto nella scelta.',
                closing,
            ].join('\n');
    }
}

/**
 * Tenta di generare una risposta immediata per intenti di link o catalogo.
 * Restituisce null se il messaggio non richiede un link catalogo.
 */
export function tryBuildCatalogLinkReply(
    message: string,
    displayName?: string | null,
    now: Date = new Date()
): string | null {
    const intent = detectCatalogLinkIntent(message);
    if (!intent) return null;
    return buildCatalogLinkReply(intent, displayName, now);
}
