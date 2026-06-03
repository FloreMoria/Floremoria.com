/**
 * POSTMAN — Agent LLM per la casella assistenza@floremoria.com.
 *
 * Modalità Human-in-the-Loop: l'agent NON invia mai. Classifica la mail in arrivo in una delle
 * 3 categorie ufficiali (FF / FT / PA), modula il tono e genera una BOZZA di risposta che verrà
 * salvata nei Drafts di Aruba e mostrata in dashboard per l'approvazione umana.
 *
 * LLM: OpenAI via fetch (stesso approccio già usato in Script/hydra/engine.mjs), nessun SDK aggiuntivo.
 */

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

/**
 * Regole di business (tono di voce per categoria). Vincoli: dare del "Lei", nessuna invenzione di
 * fatti/prezzi/date, nessuna promessa fuori standard, firma istituzionale, bozza pronta alla revisione.
 */
export function buildPostmanSystemPrompt(): string {
    return [
        'Sei POSTMAN, assistente email di FloreMoria (consegna di omaggi floreali sulle tombe nei cimiteri italiani, con foto di conferma).',
        'Il tuo compito: leggere una email ricevuta sulla casella assistenza@floremoria.com, classificarla e redigere una BOZZA di risposta in italiano.',
        '',
        'CLASSIFICAZIONE — scegli UNA sola categoria tra:',
        '- FF (Funerale): richieste legate a funerali imminenti/recenti. Tono formale, empatico, uso del "Lei", massima tempestività e delicatezza.',
        '- FT (Fiori sulle Tombe): omaggi su tombe in cimiteri, ricorrenze, anniversari, manutenzione floreale ricorrente. Tono professionale e rassicurante, gestione di cimitero/ricorrenza.',
        '- PA (Piccoli Amici): perdita di animali domestici. Tono estremamente dolce, protettivo ed empatico verso il lutto per un animale.',
        'Se ambigua, scegli la categoria più probabile dal contenuto.',
        '',
        'REGOLE DI SCRITTURA DELLA BOZZA:',
        '- Dai sempre del "Lei". Se conosci il nome del mittente, usalo con garbo.',
        '- Non inventare MAI prezzi, date di consegna, disponibilità o dettagli operativi non presenti nella mail. In assenza di dati certi, chiedi gentilmente le informazioni mancanti (es. cimitero, città, nome del defunto/animale, data desiderata).',
        '- Non prendere impegni vincolanti: è una bozza che verrà rivista e inviata da un operatore umano.',
        '- Tono mai sdolcinato né funereo/drammatico; rassicurante, sobrio, umano.',
        '- Valorizza la foto di conferma come atto di rispetto e trasparenza, non come argomento commerciale.',
        '- Chiudi con firma istituzionale: "Un caro saluto,\\nAssistenza FloreMoria".',
        '',
        'OUTPUT: rispondi ESCLUSIVAMENTE con JSON valido, senza markdown, con esattamente queste chiavi:',
        '{"category": "FF|FT|PA", "subject": "oggetto della risposta", "body": "testo completo della bozza", "reasoning": "1 frase sul perché di questa categoria"}',
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

/**
 * Classifica la mail e genera la bozza. Lancia PostmanConfigError se manca OPENAI_API_KEY.
 */
export async function classifyAndDraft(input: PostmanIncoming): Promise<PostmanDraft> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new PostmanConfigError('OPENAI_API_KEY non configurata: impossibile generare la bozza.');
    }
    const model = process.env.POSTMAN_OPENAI_MODEL?.trim() || 'gpt-4o-mini';

    const userContent = [
        `Mittente: ${input.fromName || '(sconosciuto)'} <${input.fromEmail || 'n/d'}>`,
        `Oggetto ricevuto: ${input.subject || '(nessun oggetto)'}`,
        '',
        'Testo della email ricevuta:',
        '"""',
        (input.text || '').slice(0, 6000),
        '"""',
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: buildPostmanSystemPrompt() },
                { role: 'user', content: userContent },
            ],
            temperature: 0.4,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`OpenAI HTTP ${response.status}: ${errText.slice(0, 500)}`);
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
        throw new Error('Risposta OpenAI vuota.');
    }

    let parsed: { category?: string; subject?: string; body?: string; reasoning?: string };
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('Risposta OpenAI non in formato JSON valido.');
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
