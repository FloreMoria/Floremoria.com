import prisma from '@/lib/prisma';
import type { ChatSession } from '@/lib/chatStore';
import type { VeraCallerContext } from '@/lib/vera/callerContext';

export interface HumanOperatorExample {
    id: string;
    sessionId: string;
    sessionName: string;
    userType: 'CUSTOMER' | 'FLORIST' | 'UNKNOWN';
    inboundText: string;
    operatorResponse: string;
    createdAt: Date;
    topics: string[];
}

function asMeta(raw: unknown): Record<string, string> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (v == null) continue;
        out[k] = typeof v === 'string' ? v : String(v);
    }
    return out;
}

/**
 * Riconosce se un messaggio outbound è stato redatto e inviato manualmente da un operatore umano dello Staff/Admin.
 */
export function isHumanOperatorMessage(msg: { direction: string; metadata: unknown; body: string }): boolean {
    if (msg.direction !== 'OUTBOUND') return false;
    const body = msg.body?.trim() || '';
    if (!body || body.length < 5) return false;

    // Scarta risposte brevi e isolate prive di valore procedurale (es. "ok", "scusa", "grazie")
    if (/^(scusa|grazie|ok|si|sì|prego|buongiorno|buonasera)$/i.test(body)) return false;

    const meta = asMeta(msg.metadata);
    const source = (meta.source || '').toLowerCase();
    const event = meta.eventType || '';
    const mode = meta.outboundMode || '';

    // Escludi template automatici di sistema e workflow deterministici
    if (
        event.includes('TEMPLATE') ||
        event === 'GIFT_VOUCHER' ||
        source.includes('punto') ||
        source.includes('deterministic') ||
        source.includes('gemini') ||
        source.includes('catalog') ||
        source === 'silence' ||
        mode === 'template_fallback_24h'
    ) {
        return false;
    }

    // Scarta template statici di sistema con placeholder o prefissi noti
    if (body.startsWith('Vera | Staff FloreMoria') || body.startsWith('Ciao Antonella! 🌸\nAbbiamo un nuovo ordine')) {
        return false;
    }

    if (source === 'operator' || source.includes('operator')) return true;
    if (meta.sender === 'STAFF' || meta.sender === 'ADMIN') return true;
    if (mode === 'freetext' && source === 'operator') return true;

    return false;
}

/**
 * Estrae i tag tematici/intenti da una conversazione.
 */
function extractTopics(text: string): string[] {
    const t = text.toLowerCase();
    const topics: string[] = [];

    if (/foto|photo|immagine|posa|scatto|prova|garanzia|prima e dopo|prima della posa/.test(t)) {
        topics.push('photo_proof');
    }
    if (/tomba|loculo|fila|campo|cimitero|posizione|fabbricato|numero|piastra|lapide/.test(t)) {
        topics.push('tomb_location');
    }
    if (/buono|sconto|voucher|carolina10|codice|promozione|omaggio 10/.test(t)) {
        topics.push('voucher_discount');
    }
    if (/bonifico|fattura|compenso|iban|pagamento|ricevuta|p\.iva|pec|sdi|codice univoco|saldo/.test(t)) {
        topics.push('payment_invoice');
    }
    if (/scus|disguid|errore|problema|reclamo|concorrenza|scorso mese|appassiti|mancano|non c'erano/.test(t)) {
        topics.push('apology_service_issue');
    }
    if (/quotazione|preventivo|pianta|vaso|grande|colori|misto|più grande|due piante|personalizz/.test(t)) {
        topics.push('custom_quote');
    }
    if (/recensione|google|valutazione|stelle|lasciare una recensione/.test(t)) {
        topics.push('review_request');
    }
    if (/orari|consegna|domani|domenica|mattina|giorno|anticipo|orario|quando consegn/.test(t)) {
        topics.push('delivery_schedule');
    }
    if (/condoglianze|ricordo|caramente|affetto|mancanza|cordoglio|caro/.test(t)) {
        topics.push('condolences');
    }
    if (/mini-app|link|floremoria\.com\/fiorista|aprire link/.test(t)) {
        topics.push('florist_miniapp');
    }

    return topics;
}

/**
 * Tokenizza una stringa in un insieme di parole chiave significative.
 */
function tokenize(text: string): Set<string> {
    const stopWords = new Set([
        'che', 'del', 'della', 'dei', 'delle', 'con', 'per', 'una', 'uno', 'gli', 'non',
        'nel', 'nella', 'dei', 'sul', 'sulla', 'alla', 'delle', 'come', 'cosa', 'dove',
        'sono', 'siamo', 'avete', 'abbiamo', 'essere', 'avere', 'questo', 'questa', 'grazie'
    ]);

    const words = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !stopWords.has(w));

    return new Set(words);
}

/** Cache in memoria con TTL per evitare sovraccarico DB su traffico elevato */
let cachedExamples: HumanOperatorExample[] | null = null;
let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minuti

/**
 * Estrae e indicizza dal database lo storico dei messaggi inviati manualmente dall'operatore umano.
 */
export async function extractHumanOperatorDataset(forceRefresh = false): Promise<HumanOperatorExample[]> {
    const now = Date.now();
    if (!forceRefresh && cachedExamples && now - lastCacheFetchTime < CACHE_TTL_MS) {
        return cachedExamples;
    }

    try {
        const sessions = await prisma.whatsAppChatSession.findMany({
            where: { isTest: false },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
            },
            orderBy: { updatedAt: 'desc' },
            take: 100,
        });

        const dataset: HumanOperatorExample[] = [];

        for (const s of sessions) {
            const rawUserType = (s.userType || '').toUpperCase();
            const userType: 'CUSTOMER' | 'FLORIST' | 'UNKNOWN' =
                rawUserType === 'FLORIST'
                    ? 'FLORIST'
                    : rawUserType === 'UTENTE' || rawUserType === 'CUSTOMER'
                      ? 'CUSTOMER'
                      : 'UNKNOWN';

            const msgs = s.messages;
            for (let i = 0; i < msgs.length; i++) {
                const m = msgs[i];
                if (!isHumanOperatorMessage(m)) continue;

                // Recupera il messaggio inbound precedente (domanda o richiesta del contatto)
                let prevInbound = '';
                for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
                    if (msgs[j].direction === 'INBOUND' && msgs[j].body?.trim()) {
                        prevInbound = msgs[j].body.trim();
                        break;
                    }
                }

                const combinedText = `${prevInbound} ${m.body}`;
                const topics = extractTopics(combinedText);

                dataset.push({
                    id: m.id,
                    sessionId: s.id,
                    sessionName: s.name || s.phone,
                    userType,
                    inboundText: prevInbound,
                    operatorResponse: m.body.trim(),
                    createdAt: m.createdAt,
                    topics,
                });
            }
        }

        cachedExamples = dataset;
        lastCacheFetchTime = now;
        return dataset;
    } catch (err) {
        console.error('[veraHumanKnowledge] Errore estrazione dataset storico operatore:', err);
        return cachedExamples || [];
    }
}

export type FindHumanExamplesOptions = {
    message: string;
    userType?: ChatSession['userType'];
    callerContext?: VeraCallerContext;
    limit?: number;
};

/**
 * Seleziona i 3-5 esempi più pertinenti tra le risposte storiche dell'operatore umano
 * mediante matching semantico, lessicale e tematico.
 */
export async function findRelevantHumanExamples(
    options: FindHumanExamplesOptions
): Promise<HumanOperatorExample[]> {
    const { message, userType, callerContext, limit = 4 } = options;
    const dataset = await extractHumanOperatorDataset();
    if (!dataset || dataset.length === 0) return [];

    const targetUserType: 'CUSTOMER' | 'FLORIST' | 'UNKNOWN' =
        userType === 'FLORIST' ? 'FLORIST' : userType === 'UTENTE' ? 'CUSTOMER' : 'UNKNOWN';

    const fullQuery = [
        message,
        callerContext?.orderNumber ? `ordine ${callerContext.orderNumber}` : '',
        callerContext?.deceasedName ? `defunto ${callerContext.deceasedName}` : '',
    ]
        .filter(Boolean)
        .join(' ');

    const queryTokens = tokenize(fullQuery);
    const queryTopics = extractTopics(fullQuery);

    const scored = dataset.map((ex) => {
        let score = 0;

        // 1. Audience / Channel match (Tassativo)
        if (ex.userType === targetUserType) {
            score += 12;
        } else if (targetUserType !== 'UNKNOWN' && ex.userType !== 'UNKNOWN' && ex.userType !== targetUserType) {
            score -= 30; // Forte penalità se il canale è errato (es. risposta a fiorista proposta a un cliente)
        }

        // 2. Inbound Text token overlap (domanda simile dell'interlocutore)
        const inboundTokens = tokenize(ex.inboundText);
        let inboundMatches = 0;
        queryTokens.forEach((tok) => {
            if (inboundTokens.has(tok)) inboundMatches++;
        });
        score += inboundMatches * 9;

        // 3. Operator Response token overlap (aderenza al tema della soluzione)
        const operatorTokens = tokenize(ex.operatorResponse);
        let operatorMatches = 0;
        queryTokens.forEach((tok) => {
            if (operatorTokens.has(tok)) operatorMatches++;
        });
        score += operatorMatches * 4;

        // 4. Topic / Intent overlap
        const exTopics = new Set(ex.topics);
        queryTopics.forEach((tp) => {
            if (exTopics.has(tp)) score += 15;
        });

        // 5. Qualità e struttura della risposta dell'operatore
        if (ex.operatorResponse.length >= 25 && ex.operatorResponse.length <= 400) {
            score += 4;
        }
        if (ex.inboundText && ex.inboundText.length >= 5) {
            score += 5;
        }

        return { example: ex, score };
    });

    return scored
        .filter((s) => s.score > 8)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => s.example);
}

/**
 * Formatta gli esempi selezionati in un blocco Few-Shot Ground Truth da iniettare nel system prompt di Vera.
 */
export function formatFewShotHumanPromptBlock(
    examples: HumanOperatorExample[],
    userType: ChatSession['userType']
): string {
    if (!examples || examples.length === 0) {
        return '';
    }

    const channelLabel = userType === 'FLORIST' ? 'FIORISTA / PARTNER' : 'CLIENTE';

    const formattedExamples = examples
        .map((ex, idx) => {
            const userPrompt = ex.inboundText
                ? `Interlocutore: "${ex.inboundText}"`
                : `Situazione: Contesto ${ex.topics.join(', ') || 'generale'}`;
            return `[ESEMPIO REALE OPERATORE ${idx + 1} - Canale ${ex.userType === 'FLORIST' ? 'Fioristi' : 'Clienti'}]
${userPrompt}
Risposta Operatore Umano: "${ex.operatorResponse}"`;
        })
        .join('\n\n');

    return `
### ESEMPI GUIDA DALL'OPERATORE UMANO (GROUND TRUTH)
Queste sono risposte reali fornite dall'amministratore e dallo Staff umano in situazioni analoghe (${channelLabel}).
Usa lo stesso tono (empatico, limpido e concreto per i clienti; operativo, collaborativo e professionale per i fioristi).
Non ripetere convenevoli inutili e attieniti ai fatti e alle soluzioni reali:

${formattedExamples}

REGOLA PROCEDURALE TASSATIVA: Se l'operatore umano in passato ha gestito una casistica specifica con una determinata procedura (es. chiarimento posa/foto, buono omaggio per disguido, quotazione per piante o composizioni miste, bonifico e dati fattura fiorista), segui rigorosamente la medesima logica.
`.trim();
}

/**
 * Helper all-in-one per generare il blocco di Few-Shot per il prompt builder di Vera.
 */
export async function getRelevantHumanExamplesPromptBlock(
    options: FindHumanExamplesOptions
): Promise<string> {
    const examples = await findRelevantHumanExamples(options);
    return formatFewShotHumanPromptBlock(examples, options.userType || 'UNKNOWN');
}
