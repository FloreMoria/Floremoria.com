import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { clampWarmThoughtForTemplate } from '@/lib/vera/clampWarmThought';

const FALLBACK_THOUGHT =
    'Ci prendiamo cura di ogni dettaglio con dedizione e Le invieremo la foto non appena i fiori saranno posati.';

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
    const prompt = `Scrivi UNA sola frase calda e rispettosa in italiano (massimo 100 caratteri), senza saluti, senza nome del destinatario, senza firma.
Contesto: messaggio di conferma ordine floreale funebre per il ricordo di ${deceased}.
Tono: garbo, lutto, rassicurazione sulla cura floreale e sulla foto prova imminente.
Niente prezzi, link, codici ordine, "caro/cordiali". Inizia direttamente con il contenuto (es. "Ci prendiamo cura…").`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.6, maxOutputTokens: 80 },
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
        const clamped = clampWarmThoughtForTemplate(text);
        return clamped || FALLBACK_THOUGHT;
    } catch {
        return FALLBACK_THOUGHT;
    }
}
