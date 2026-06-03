/**
 * POSTMAN — Cervello dell'Agent per assistenza@floremoria.com.
 *
 * Modalità Human-in-the-Loop: l'agent NON invia mai. Classifica la mail in arrivo in una delle
 * 3 categorie ufficiali (FF / FT / PA), modula il tono e genera una BOZZA di risposta breve e
 * concisa, che verrà salvata nei Drafts di Aruba e mostrata in dashboard per l'approvazione umana.
 *
 * Motore: Google Gemini (SDK @google/genai). Il system prompt simula l'orchestra interna dei 16
 * Agent AI di FloreMoria (SOFIA/ALMA etica+empatia, ARLO Quiet Luxury, MARK/VINCE funnel+checkout,
 * ALBERTO/OSCAR prezzi listino + logistica cimiteriale).
 *
 * La pipeline IMAP/SMTP (mailbox.ts) resta invariata: questo modulo espone le stesse interfacce
 * (classifyAndDraft, PostmanDraft, PostmanConfigError) usate dalla rotta cron.
 */
import { GoogleGenAI } from '@google/genai';

export type PostmanCategory = 'FF' | 'FT' | 'PA';

export interface PostmanIncoming {
    fromName: string;
    fromEmail: string;
    subject: string;
    text: string;
}

export interface PostmanDraft {
    category: PostmanCategory;
    subject: string;
    body: string;
    reasoning: string;
}

export class PostmanConfigError extends Error {}

const VALID_CATEGORIES: PostmanCategory[] = ['FF', 'FT', 'PA'];

/** Link diretti al funnel/checkout per categoria (reali, già usati nel resto del sito). Override via env. */
export function getCheckoutLinks(): Record<PostmanCategory, string> {
    return {
        FF: process.env.POSTMAN_CHECKOUT_FF?.trim() || 'https://www.floremoria.com/per-il-funerale',
        FT: process.env.POSTMAN_CHECKOUT_FT?.trim() || 'https://www.floremoria.com/fiori-sulle-tombe',
        PA: process.env.POSTMAN_CHECKOUT_PA?.trim() || 'https://www.floremoria.com/per-animali-domestici',
    };
}

/**
 * System prompt strutturato: orchestra dei 16 Agent + regole di concisione assoluta + 3 categorie.
 */
export function buildPostmanSystemPrompt(): string {
    return [
        'Sei POSTMAN, la voce email di FloreMoria (consegna di omaggi floreali sulle tombe nei cimiteri italiani, con foto di conferma).',
        'Operi come orchestra coordinata dei 16 Agent interni di FloreMoria. Prima di scrivere, fai convergere queste competenze:',
        '- SOFIA + ALMA: blindano etica, dignità ed empatia. Nessun dark pattern, nessuna leva sul dolore, nessuna urgenza artificiale.',
        '- ARLO: stile "Quiet Luxury" — essenziale, pulito, elegante. Niente fronzoli.',
        '- MARK + VINCE: guidano dolcemente verso il completamento dell\'ordine inserendo UNA volta il link di checkout diretto pertinente alla categoria.',
        '- ALBERTO + OSCAR: prezzi e logistica. NON inventare mai prezzi, importi, date o disponibilità del cimitero: se servono, il prezzo si vede al link; chiedi i dati mancanti (cimitero, città, nome del defunto/animale, data).',
        '',
        'REGOLE DI SCRITTURA (vincolanti):',
        '1. CONCISIONE ASSOLUTA: massimo 3-4 frasi, nessun muro di testo. Una risposta semplice, breve, focalizzata sull\'obiettivo.',
        '2. Dai sempre del "Lei". Se conosci il nome del mittente, usalo con garbo una sola volta.',
        '3. Inserisci il link di checkout SOLO quello pertinente alla categoria scelta (te lo fornisco nel messaggio utente).',
        '4. È una BOZZA: verrà riletta e inviata da un operatore umano. Non prendere impegni vincolanti.',
        '5. Chiudi con firma sobria su nuova riga: "Assistenza FloreMoria".',
        '',
        'TONO PER CATEGORIA:',
        '- FF (Funerale): solenne, rigoroso uso del "Lei", massima delicatezza e tempestività; link al checkout prioritario.',
        '- FT (Fiori sulle Tombe): professionale e rassicurante; valorizza i servizi di posa ricorrente (ricorrenze/anniversari).',
        '- PA (Piccoli Amici): estremamente dolce, protettivo e delicato per il lutto di un animale domestico.',
        '',
        'OUTPUT: rispondi ESCLUSIVAMENTE con JSON valido (nessun markdown), con esattamente queste chiavi:',
        '{"category":"FF|FT|PA","subject":"oggetto risposta","body":"bozza 3-4 frasi con il link pertinente","reasoning":"1 frase sul perché della categoria"}',
    ].join('\n');
}

function safeReplySubject(original: string): string {
    const s = (original || '').trim();
    if (!s) return 'Re: La sua richiesta — FloreMoria';
    return /^re:/i.test(s) ? s : `Re: ${s}`;
}

function coerceCategory(value: unknown): PostmanCategory {
    const v = String(value || '').toUpperCase().trim();
    return (VALID_CATEGORIES as string[]).includes(v) ? (v as PostmanCategory) : 'FT';
}

function stripJsonFences(raw: string): string {
    // Difesa: se il modello incapsula il JSON in fence ```json ... ```, lo ripuliamo.
    return raw
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

/**
 * Classifica la mail e genera la bozza tramite Gemini. Lancia PostmanConfigError se manca la API key.
 */
export async function classifyAndDraft(input: PostmanIncoming): Promise<PostmanDraft> {
    const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    if (!apiKey) {
        throw new PostmanConfigError('GEMINI_API_KEY non configurata: impossibile generare la bozza.');
    }
    const model = process.env.POSTMAN_GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
    const links = getCheckoutLinks();

    const userContent = [
        `Mittente: ${input.fromName || '(sconosciuto)'} <${input.fromEmail || 'n/d'}>`,
        `Oggetto ricevuto: ${input.subject || '(nessun oggetto)'}`,
        '',
        'Link di checkout disponibili per categoria (usa SOLO quello della categoria scelta):',
        `- FF (Funerale): ${links.FF}`,
        `- FT (Fiori sulle Tombe): ${links.FT}`,
        `- PA (Piccoli Amici): ${links.PA}`,
        '',
        'Testo della email ricevuta:',
        '"""',
        (input.text || '').slice(0, 6000),
        '"""',
    ].join('\n');

    const ai = new GoogleGenAI({ apiKey });

    let rawText: string | undefined;
    try {
        const response = await ai.models.generateContent({
            model,
            contents: userContent,
            config: {
                systemInstruction: buildPostmanSystemPrompt(),
                responseMimeType: 'application/json',
                temperature: 0.4,
            },
        });
        rawText = response.text;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Errore chiamata Gemini: ${msg}`);
    }

    if (!rawText || !rawText.trim()) {
        throw new Error('Risposta Gemini vuota.');
    }

    let parsed: { category?: string; subject?: string; body?: string; reasoning?: string };
    try {
        parsed = JSON.parse(stripJsonFences(rawText));
    } catch {
        throw new Error('Risposta Gemini non in formato JSON valido.');
    }

    const category = coerceCategory(parsed.category);
    const body = (parsed.body || '').trim();
    if (!body) {
        throw new Error('La bozza generata è vuota.');
    }

    return {
        category,
        subject: (parsed.subject || '').trim() || safeReplySubject(input.subject),
        body,
        reasoning: (parsed.reasoning || '').trim() || `Categoria assegnata: ${category}.`,
    };
}
