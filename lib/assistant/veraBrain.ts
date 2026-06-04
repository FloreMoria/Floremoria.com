/**
 * VERA — Cervello conversazionale WhatsApp di FloreMoria (Gemini, orchestra 16 Agent).
 *
 * Stessa filosofia del motore POSTMAN (lib/postman/agent.ts) ma adattata alla chat:
 * risposte brevissime (3-4 frasi), tono d'élite, "Lei", orientamento al funnel con il link
 * corretto per intento, divieto assoluto della parola "cliente" (solo "utente").
 *
 * Resilienza: se manca GEMINI_API_KEY o la chiamata fallisce, si ricade automaticamente sulla
 * logica deterministica esistente (buildWhatsAppAiReply) così il canale non resta mai senza risposta.
 */
import { GoogleGenAI } from '@google/genai';
import { FLOREM_DIGITAL_ASSISTANT_SYSTEM_PROMPT } from '../floremDigitalAssistant';
import { buildWhatsAppAiReply, loadWhatsAppCoreKb } from '../whatsappKnowledge';

export interface VeraHistoryMessage {
    direction: 'INBOUND' | 'OUTBOUND';
    body: string;
    mediaUrl?: string;
    createdAt?: string;
}

export interface VeraReplyInput {
    message: string;
    userName: string;
    userType: 'UTENTE' | 'FLORIST' | 'UNKNOWN';
    mediaUrl?: string | null;
    history?: VeraHistoryMessage[];
}

type CoreKb = ReturnType<typeof loadWhatsAppCoreKb>;

/** Numero massimo di turni di cronologia da iniettare (controllo token + memoria conversazionale). */
const MAX_HISTORY_TURNS = 20;

function getGeminiApiKey(): string | null {
    return (
        process.env.GEMINI_API_KEY?.trim() ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
        null
    );
}

/**
 * System prompt: anima ufficiale di VERA + orchestra dei 16 Agent + regole ferree del brand.
 * I link reali vengono iniettati dal core KB per evitare URL inventati.
 */
export function buildVeraSystemPrompt(kb: CoreKb): string {
    return [
        FLOREM_DIGITAL_ASSISTANT_SYSTEM_PROMPT,
        '',
        '=== ORCHESTRA DEI 16 AGENT (fai convergere queste competenze prima di scrivere) ===',
        '- SOFIA + ALMA: blindano etica, dignità ed empatia. Nessun dark pattern, nessuna leva sul dolore, nessuna urgenza artificiale. VINCOLO LESSICALE TASSATIVO: la parola "cliente" è VIETATA in modo assoluto; chi scrive è SEMPRE e solo l\'"utente".',
        '- ARLO: stile "Quiet Luxury" — essenziale, pulito, elegante, d\'élite. Niente fronzoli, niente emoji a raffica.',
        '- MARK + VINCE: guidano con garbo l\'utente al passo successivo del funnel, inserendo UNA sola volta il link diretto pertinente all\'intento (mai più link nello stesso messaggio).',
        '- ALBERTO + OSCAR: prezzi e logistica. NON inventare MAI prezzi, importi, date o disponibilità del cimitero. Se servono, indirizza al link dove il prezzo è visibile e chiedi i dati mancanti (cimitero, città, nome del defunto/animale, data).',
        '- MARTINA: verità botanica — non promettere fiori o composizioni non plausibili per la stagione.',
        '',
        '=== REGOLE FERREE DI SCRITTURA (vincolanti) ===',
        '1. CONCISIONE ASSOLUTA: massimo 3-4 frasi. Mai muri di testo. Una sola domanda per volta.',
        '2. Dai sempre del "Lei", tono d\'élite, sobrio e rassicurante. Se conosci il nome proprio, usalo con garbo una sola volta a inizio frase.',
        '3. VINCOLO LESSICALE ASSOLUTO: non usare MAI "cliente" (né varianti). Usa "utente" o rivolgiti direttamente con il "Lei".',
        '4. USA SOLO i link reali qui sotto, pertinenti all\'intento. È VIETATO inventare URL, prezzi, sconti o promesse.',
        '5. Orientamento al funnel: quando l\'intento è chiaro (tomba/cimitero, funerale, animale domestico), accompagna l\'utente al link corretto senza farlo perdere tempo.',
        '6. Promuovi la testimonianza fotografica come atto di rispetto e trasparenza, mai come upsell.',
        '',
        '=== LINK UFFICIALI PER INTENTO (gli unici utilizzabili) ===',
        `- Fiori sulle tombe / cimitero: ${kb.catalogTombsUrl}`,
        `- Omaggio Solenne per il funerale: ${kb.funeralUrl}`,
        `- Piccoli amici (animali domestici): ${kb.petsUrl}`,
        `- Orari assistenza: ${kb.supportHours} — contatto umano: ${kb.supportWhatsapp} / ${kb.supportEmail}`,
        '',
        'OUTPUT: rispondi ESCLUSIVAMENTE con il testo del messaggio da inviare su WhatsApp (nessun JSON, nessun markdown, nessuna firma). Solo la risposta, breve e pronta.',
    ].join('\n');
}

interface GeminiContent {
    role: 'user' | 'model';
    parts: { text: string }[];
}

/** Trasforma la cronologia della chat in turni per Gemini (INBOUND=user, OUTBOUND=model). */
function buildContents(input: VeraReplyInput): GeminiContent[] {
    const history = (input.history || []).slice(-MAX_HISTORY_TURNS);
    const contents: GeminiContent[] = [];

    for (const msg of history) {
        const text = (msg.body || '').trim();
        if (!text) continue;
        contents.push({
            role: msg.direction === 'OUTBOUND' ? 'model' : 'user',
            parts: [{ text }],
        });
    }

    // Messaggio corrente (con nota immagine se presente, per dare contesto al modello).
    const currentParts: string[] = [];
    if (input.mediaUrl) currentParts.push('[L\'utente ha inviato un\'immagine]');
    currentParts.push((input.message || '').trim() || '(messaggio senza testo)');
    contents.push({ role: 'user', parts: [{ text: currentParts.join('\n') }] });

    // Gemini richiede che l'ultimo turno sia dell'utente: garantito dal push qui sopra.
    return contents;
}

/**
 * Genera la risposta di VERA tramite Gemini. In caso di chiave mancante o errore,
 * ricade sulla logica deterministica esistente (nessuna risposta vuota).
 */
export async function generateVeraReply(input: VeraReplyInput): Promise<string> {
    const kb = loadWhatsAppCoreKb();
    const deterministicFallback = () =>
        buildWhatsAppAiReply({
            message: input.message,
            userName: input.userName,
            userType: input.userType,
            mediaUrl: input.mediaUrl,
            history: input.history,
        });

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        console.warn('[VERA] GEMINI_API_KEY non configurata: uso il motore deterministico di fallback.');
        return deterministicFallback();
    }

    const model = process.env.VERA_GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model,
            contents: buildContents(input),
            config: {
                systemInstruction: buildVeraSystemPrompt(kb),
                temperature: 0.5,
                maxOutputTokens: 400,
            },
        });
        const text = (response.text || '').trim();
        if (!text) {
            console.warn('[VERA] Risposta Gemini vuota: uso il fallback deterministico.');
            return deterministicFallback();
        }
        return text;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[VERA] Errore Gemini, fallback deterministico:', msg);
        return deterministicFallback();
    }
}
