/**
 * VERA AI Reply — Generatore di risposte WhatsApp per il canale proprietario FloreMoria.
 *
 * Strategia ibrida (Recommended C):
 *  1. Prova le regole deterministiche di `buildWhatsAppAiReply` (whatsappKnowledge.ts).
 *  2. Se la risposta è identica al messaggio guida standard (nessun match specifico),
 *     chiama Gemini con il system prompt completo di VERA + cronologia sessione.
 *  3. Aggiunge sempre la firma di chiusura quando la sessione si chiude o l'utente saluta.
 *
 * Chiusura tassativa (su saluto/addio o handoff umano):
 *   "Tutto lo Staff di FloreMoria le augura il meglio e la saluta cordialmente 🌹"
 */

import { FLOREM_DIGITAL_ASSISTANT_SYSTEM_PROMPT } from '@/lib/floremDigitalAssistant';
import {
    buildWhatsAppAiReply,
    STANDARD_GUIDANCE_MESSAGE,
    loadWhatsAppCoreKb,
    loadWhatsAppHistoricalKb,
} from '@/lib/whatsappKnowledge';
import type { ChatSession } from '@/lib/chatStore';

export const VERA_CLOSING_SIGNATURE =
    'Tutto lo Staff di FloreMoria le augura il meglio e la saluta cordialmente 🌹';

/** Parole chiave che indicano un saluto / congedo da parte dell'utente. */
const FAREWELL_KEYWORDS = [
    'grazie',
    'arrivederci',
    'a presto',
    'ciao',
    'buona giornata',
    'buona serata',
    'buona notte',
    'ci sentiamo',
    'va bene così',
    'ho finito',
];

function isFarewellMessage(message: string): boolean {
    const m = message.toLowerCase().trim();
    return FAREWELL_KEYWORDS.some((k) => m.includes(k));
}

function shouldAppendSignature(message: string): boolean {
    return isFarewellMessage(message);
}

/** Costruisce il blocco storico messaggi per il prompt Gemini (ultimi N messaggi). */
function buildHistoryBlock(session: ChatSession, maxMessages = 12): string {
    const recent = session.messages.slice(-maxMessages);
    if (recent.length === 0) return '';
    return recent
        .map((msg) => {
            const role = msg.direction === 'INBOUND' ? 'UTENTE' : 'VERA';
            return `[${role}]: ${msg.body}`;
        })
        .join('\n');
}

/**
 * Chiama Google Gemini con il system prompt VERA completo.
 * Richiede GEMINI_API_KEY nel environment.
 * Ritorna null in caso di errore (il chiamante usa il fallback deterministico).
 */
async function callGeminiVera(
    userMessage: string,
    session: ChatSession,
    knowledgeContext: string
): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
        console.warn('[vera-ai] GEMINI_API_KEY non configurata: salto LLM, uso risposta deterministica.');
        return null;
    }

    const model = process.env.POSTMAN_GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
    const historyBlock = buildHistoryBlock(session);

    const systemInstruction = `${FLOREM_DIGITAL_ASSISTANT_SYSTEM_PROMPT}

---
KNOWLEDGE BASE FLOREMORIA (usa solo queste informazioni per prezzi, URL, policy):
${knowledgeContext}

STORICO CONVERSAZIONE:
${historyBlock || '(nessun messaggio precedente)'}
---

Rispondi SOLO al messaggio dell'utente qui sotto con una risposta breve e pertinente.
NON includere prefissi tipo "[VERA]:" nella risposta.
NON inventare prezzi, URL o informazioni non presenti nella knowledge base.
La risposta deve essere in italiano, sobria, empatica, mai più di 4-5 righe.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 512,
            topP: 0.9,
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            const err = await res.text().catch(() => '');
            console.error(`[vera-ai] Gemini HTTP ${res.status}:`, err.slice(0, 300));
            return null;
        }

        const data = (await res.json()) as {
            candidates?: Array<{
                content?: { parts?: Array<{ text?: string }> };
                finishReason?: string;
            }>;
        };

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!text) {
            console.warn('[vera-ai] Gemini: risposta vuota o bloccata.');
            return null;
        }
        return text;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[vera-ai] Errore chiamata Gemini:', msg);
        return null;
    }
}

export interface VeraReplyResult {
    text: string;
    source: 'deterministic' | 'gemini' | 'fallback';
    shouldEscalate: boolean;
}

/**
 * Genera la risposta VERA per un messaggio WhatsApp in entrata.
 *
 * @param message     Testo grezzo del messaggio utente
 * @param session     Sessione WhatsApp corrente (include cronologia)
 * @param mediaUrl    URL media allegato (opzionale)
 */
export async function generateVeraReply(
    message: string,
    session: ChatSession,
    mediaUrl?: string | null
): Promise<VeraReplyResult> {
    const { shouldEscalateToHuman, getHumanEscalationReason } = await import('@/lib/floremDigitalAssistant');

    // ── Escalation a operatore umano ──────────────────────────────────────────
    const escalationReason = getHumanEscalationReason(message);
    if (escalationReason) {
        console.info(`[vera-ai] Escalation umana: ${escalationReason}`);
        const escalationText =
            'La ringrazio per averci scritto. La sto passando a un operatore umano del nostro Staff, che la contatterà il prima possibile.\n\n' +
            VERA_CLOSING_SIGNATURE;
        return { text: escalationText, source: 'deterministic', shouldEscalate: true };
    }

    // ── Risposta deterministica (regole whatsappKnowledge) ───────────────────
    const deterministicReply = buildWhatsAppAiReply({
        message,
        userName: session.name || '',
        userType: session.userType,
        mediaUrl,
        history: session.messages.map((m) => ({
            direction: m.direction,
            body: m.body,
            mediaUrl: m.mediaUrl,
            createdAt: m.createdAt,
        })),
    });

    const isGenericFallback = deterministicReply.trim() === STANDARD_GUIDANCE_MESSAGE.trim();

    let replyText: string;
    let source: VeraReplyResult['source'];

    if (!isGenericFallback) {
        // Match specifico trovato: usa la risposta deterministica
        replyText = deterministicReply;
        source = 'deterministic';
    } else {
        // Nessun match specifico: prova Gemini LLM
        const kb = loadWhatsAppCoreKb();
        const historicalKb = loadWhatsAppHistoricalKb();
        const knowledgeContext = [
            `- Email assistenza: ${kb.supportEmail}`,
            `- WhatsApp assistenza: ${kb.supportWhatsapp}`,
            `- Orario assistenza: ${kb.supportHours}`,
            `- Sito: ${kb.siteUrl}`,
            `- Catalogo tombe: ${kb.catalogTombsUrl}`,
            `- Funerale: ${kb.funeralUrl}`,
            `- Animali: ${kb.petsUrl}`,
            historicalKb ? `\nKnowledge base estesa:\n${historicalKb.slice(0, 3000)}` : '',
        ]
            .filter(Boolean)
            .join('\n');

        const geminiReply = await callGeminiVera(message, session, knowledgeContext);

        if (geminiReply) {
            replyText = geminiReply;
            source = 'gemini';
        } else {
            // Doppio fallback: risposta guida standard
            replyText = STANDARD_GUIDANCE_MESSAGE;
            source = 'fallback';
        }
    }

    // ── Firma di chiusura (solo su messaggi di saluto) ───────────────────────
    if (shouldAppendSignature(message)) {
        replyText = `${replyText}\n\n${VERA_CLOSING_SIGNATURE}`;
    }

    return { text: replyText, source, shouldEscalate: false };
}
