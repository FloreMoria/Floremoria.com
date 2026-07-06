import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';

const FALLBACK_THOUGHT =
    'Ci prendiamo cura di ogni dettaglio con la massima dedizione e Le trasmetteremo la testimonianza fotografica non appena i fiori saranno posati.';

/**
 * Genera il pensiero caloroso {{3}} per floremoria_conferma_ordine_utente.
 * Usa Gemini se disponibile; fallback empatico statico.
 */
export async function generateWarmOrderThought(input: {
    buyerName?: string | null;
    deceasedName?: string | null;
}): Promise<string> {
    const name = extractFirstNameFromProfile(input.buyerName) || 'Utente';
    const deceased = (input.deceasedName || 'chi ama').trim();

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return FALLBACK_THOUGHT;

    const model = process.env.POSTMAN_GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
    const prompt = `Scrivi UNA sola frase calda e rispettosa in italiano (max 220 caratteri), senza saluti né firma.
Destinatario: ${name}. Ricordo per: ${deceased}.
Tono: garbo, lutto, rassicurazione sulla cura floreale e sulla foto prova imminente.
Niente prezzi, link o codici ordine.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.6, maxOutputTokens: 120 },
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) return FALLBACK_THOUGHT;

        const data = (await res.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
            ?.replace(/[\r\n]+/g, ' ')
            .trim();

        if (!text || text.length < 12) return FALLBACK_THOUGHT;
        return text.slice(0, 900);
    } catch {
        return FALLBACK_THOUGHT;
    }
}
