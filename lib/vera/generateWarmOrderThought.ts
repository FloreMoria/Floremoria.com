import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import {
    buildDefaultCustomerConfirmWarmSlot,
    finalizeCustomerConfirmWarmSlot,
} from '@/lib/vera/customerOrderConfirmCopy';
import { clampWarmThoughtForTemplate } from '@/lib/vera/clampWarmThought';

const FALLBACK_THOUGHT = buildDefaultCustomerConfirmWarmSlot();

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
    const prompt = `Scrivi UNA frase breve in italiano (massimo 48 caratteri), completa di senso, con punto finale.
Senza saluti, senza nome del destinatario, senza invito a rispondere (lo aggiungiamo noi dopo).
Contesto: conferma ordine floreale commemorativo per il ricordo di ${deceased}.
Tono: Quiet Luxury, sobrio, rassicurazione sulla cura e sulla foto prova a consegna avvenuta.
Niente prezzi, link o codici ordine. Non iniziare con "Caro/Gentile".
Esempio esatto: "Le invieremo la foto della posa appena completata."
Vietato lasciare frasi incomplete (es. "foto della.").`;

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
        return finalizeCustomerConfirmWarmSlot(text);
    } catch {
        return FALLBACK_THOUGHT;
    }
}
