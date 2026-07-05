import { loadWhatsAppCoreKb } from '@/lib/whatsappKnowledge';
import { buildHistoricalToneGuidelinesOnly, resolveHistoricalAudience } from '@/lib/whatsapp/historicalToneKb';
import { HISTORICAL_CONTEXT_DISAMBIGUATION } from '@/lib/vera/constants';
import type { ChatSession } from '@/lib/chatStore';

/**
 * Knowledge slice per VERA WhatsApp: regole operative + tono sintetico.
 * NON include l'archivio grezzo da 6000 righe (evita contaminazione nomi/ordini altrui).
 */
export function buildVeraKnowledgeContext(userType: ChatSession['userType'] = 'UTENTE'): string {
    const kb = loadWhatsAppCoreKb();
    const audience = resolveHistoricalAudience(userType);

    return [
        '=== REGOLE OPERATIVE FLOREMORIA ===',
        `- Sito ufficiale: ${kb.siteUrl}`,
        `- Catalogo tombe: ${kb.catalogTombsUrl}`,
        `- Funerale: ${kb.funeralUrl}`,
        `- Piccoli amici: ${kb.petsUrl}`,
        `- Assistenza: ${kb.supportEmail} · ${kb.supportWhatsapp} · ${kb.supportHours}`,
        '- Prezzi indicativi tombe da EUR 29.99 (dettaglio sul sito).',
        '- Consegna gratuita, foto prova su WhatsApp a consegna completata.',
        '- Pagamenti tracciati (Stripe); possibile guidare al sito o link pagamento se l\'utente ha difficoltà.',
        '',
        HISTORICAL_CONTEXT_DISAMBIGUATION,
        '',
        '=== TONO (sintesi da chat storiche — solo stile, non dati) ===',
        buildHistoricalToneGuidelinesOnly(audience),
    ].join('\n');
}
