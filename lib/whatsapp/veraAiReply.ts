/**
 * VERA AI Reply — Generatore di risposte WhatsApp (Meta Cloud API) per FloreMoria.
 *
 * Strategia ibrida (Recommended C):
 *  1. Prova le regole deterministiche di `buildWhatsAppAiReply` (whatsappKnowledge.ts).
 *  2. Se la risposta è identica al messaggio guida standard (nessun match specifico),
 *     chiama Gemini con il system prompt completo di VERA + cronologia sessione.
 *  3. Aggiunge la firma di chiusura solo quando l'Utente si congeda esplicitamente.
 *
 * Chiusura tassativa (su saluto/addio o handoff umano):
 *   "Tutto lo Staff di FloreMoria le augura il meglio e la saluta cordialmente 🌹"
 */

import { FLOREM_WHATSAPP_ASSISTANT_SYSTEM_PROMPT, VERA_TONE_OF_VOICE_DIRECTIVE } from '@/lib/floremDigitalAssistant';
import {
    buildWhatsAppAiReply,
    buildWhatsAppKnowledgeContext,
    buildSimpleThanksReply,
    ensureCatalogLinksInReply,
    ensureRespectfulOpening,
    isClosingMessage,
    isSimpleThanksMessage,
    STANDARD_GUIDANCE_MESSAGE,
} from '@/lib/whatsappKnowledge';
import type { ChatSession } from '@/lib/chatStore';

export const VERA_CLOSING_SIGNATURE =
    'Tutto lo Staff di FloreMoria le augura il meglio e la saluta cordialmente 🌹';

/** Parole chiave che indicano un congedo esplicito (non saluti iniziali). */
const FAREWELL_PHRASES = [
    'arrivederci',
    'a presto',
    'buona giornata',
    'buona serata',
    'buona notte',
    'ci sentiamo',
    'va bene cosi',
    'va bene così',
    'ho finito',
    'non serve altro',
    'a risentirci',
];

function normalizeForFarewell(message: string): string {
    return message
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isFarewellMessage(message: string): boolean {
    const m = normalizeForFarewell(message);
    if (!m) return false;

    // Congedo esplicito
    if (FAREWELL_PHRASES.some((phrase) => m.includes(phrase))) return true;

    // "grazie" solo come chiusura breve (es. "grazie", "grazie mille")
    if (/^grazie(\s+mille)?$/.test(m)) return true;

    // "ciao" solo come congedo breve, non come apertura ("ciao vorrei...")
    if (/^ciao(\s+ciao)?$/.test(m)) return true;

    // Ringraziamento + congedo nella stessa frase
    if (m.includes('grazie') && FAREWELL_PHRASES.some((phrase) => m.includes(phrase))) return true;

    return false;
}

function stripClosingSignature(text: string): string {
    const escaped = VERA_CLOSING_SIGNATURE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`\\n*${escaped}\\s*$`, 'i'), '').trim();
}

function getDisplayNameFromSession(session: ChatSession): string | undefined {
    const name = session.name?.trim();
    if (!name || name.startsWith('+') || name.startsWith('whatsapp:')) return undefined;
    const parts = name.split(' ').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : undefined;
}

function sanitizeVeraReplyText(text: string): string {
    const cleaned = text
        .split('\n')
        .filter((line) => {
            const l = line.trim();
            if (!l) return true;
            const lower = l.toLowerCase();
            if (lower.startsWith('" ->') || lower.startsWith('->')) return false;
            if (lower === '*' || lower.startsWith('* ')) return false;
            if (/^(wait|let'?s|note:|thinking|output:)/i.test(l)) return false;
            if (/wait.*respectful/i.test(l)) return false;
            if (/^["'].*["']$/.test(l) && l.length < 80) return false;
            return true;
        })
        .join('\n')
        .replace(/^["']\s*/gm, '')
        .replace(/\s*["']$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // Scarta risposte quasi vuote o solo link dopo pulizia
    if (!cleaned || cleaned.replace(/https?:\/\/\S+/g, '').trim().length < 3) {
        return '';
    }
    return cleaned;
}

function polishVeraReply(reply: string, message: string, session: ChatSession): string {
    const hasPriorOutbound = session.messages.some((m) => m.direction === 'OUTBOUND');
    const closing = isClosingMessage(message);
    let text = sanitizeVeraReplyText(stripClosingSignature(reply));
    if (!text) return reply;
    if (!closing) {
        text = ensureRespectfulOpening(text, hasPriorOutbound, getDisplayNameFromSession(session));
        text = ensureCatalogLinksInReply(
            text,
            message,
            session.messages.map((m) => ({
                direction: m.direction,
                body: m.body,
                mediaUrl: m.mediaUrl,
                createdAt: m.createdAt,
            }))
        );
    }
    return text;
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
    const registerNote =
        session.userType === 'FLORIST'
            ? 'REGISTRO: Tu informale con il fiorista partner (logistica, foto, ordini). Imita le chat storiche CAPITOLO 2.'
            : 'REGISTRO: Lei formale con l\'utente finale (lutto, ricordo, garbo). Imita le chat storiche CAPITOLO 1.';

    const systemInstruction = `${FLOREM_WHATSAPP_ASSISTANT_SYSTEM_PROMPT}

---
${registerNote}

---
KNOWLEDGE BASE FLOREMORIA (regole, cataloghi, prezzi, link ufficiali, esempi storici di stile):
${knowledgeContext}

STORICO CONVERSAZIONE:
${historyBlock || '(nessun messaggio precedente)'}
---

Rispondi SOLO al messaggio dell'utente qui sotto.
TONE OF VOICE (obbligatorio): ${VERA_TONE_OF_VOICE_DIRECTIVE}
OUTPUT: esclusivamente italiano, testo finale per l'Utente. VIETATO inglese, note interne, ragionamento, frecce (->), asterischi.
NON includere prefissi tipo "[VERA]:" nella risposta.
NON inventare prezzi, URL o informazioni non presenti nella knowledge base.
Massimo 3-4 frasi brevi; link solo se utili in quel momento della conversazione — sempre con tono umano e rispettoso del ricordo, mai come notifica fredda.`;

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
        const sanitized = sanitizeVeraReplyText(text);
        if (!sanitized) {
            console.warn('[vera-ai] Gemini: risposta scartata dopo sanitizzazione.');
            return null;
        }
        return sanitized;
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

    // ── Ringraziamento / chiusura — risposta umana breve, senza link né Gemini ─
    if (isSimpleThanksMessage(message)) {
        return {
            text: `${buildSimpleThanksReply()}\n\n${VERA_CLOSING_SIGNATURE}`,
            source: 'deterministic',
            shouldEscalate: false,
        };
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
    } else if (isClosingMessage(message)) {
        replyText = buildSimpleThanksReply();
        source = 'deterministic';
    } else {
        // Nessun match specifico: prova Gemini LLM
        const knowledgeContext = buildWhatsAppKnowledgeContext(session.userType);

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

    // ── Rifinitura: tono commemorativo + link (non su messaggi di chiusura) ───
    if (!isClosingMessage(message)) {
        replyText = polishVeraReply(replyText, message, session);
    } else {
        replyText = stripClosingSignature(replyText);
    }

    // ── Firma di chiusura (solo su congedo esplicito dell'Utente) ─────────────
    replyText = stripClosingSignature(replyText);
    if (shouldAppendSignature(message) && !replyText.includes(VERA_CLOSING_SIGNATURE)) {
        replyText = `${replyText}\n\n${VERA_CLOSING_SIGNATURE}`;
    }

    return { text: replyText, source, shouldEscalate: false };
}
