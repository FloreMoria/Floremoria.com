/**
 * Florist Scout AI — HYDRA/OSCAR: fioristi di prossimità al cimitero via Gemini + Google Search/Maps.
 * Fallback deterministico: Google Places API (stesso motore di Google Maps manuale).
 */
import { GoogleGenAI } from '@google/genai';
import {
  finalizeFloristScoutRecommendations,
  type FloristScoutRecommendation,
  type FloristScoutResult,
} from '@/lib/ai/floristScoutTypes';
import { findNearbyFloristsViaGooglePlaces } from '@/lib/ai/floristScoutPlaces';

export type FloristScoutLookupMethod = 'gemini' | 'google_places' | 'none';

export type FloristScoutLookupResult = FloristScoutResult & {
  lookupMethod: FloristScoutLookupMethod;
  failureReason?: string | null;
};

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function getGeminiApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    null
  );
}

async function findNearbyFloristsViaGemini(input: {
  cemeteryName: string;
  city: string;
  address?: string | null;
}): Promise<FloristScoutLookupResult> {
  const cemeteryName = input.cemeteryName.trim();
  const city = input.city.trim();
  const address = input.address?.trim() || null;
  const cemeteryLabel = [cemeteryName, city].filter(Boolean).join(', ');

  const empty: FloristScoutLookupResult = {
    cemetery: cemeteryLabel,
    city,
    cemeteryCity: city,
    cemeteryAddress: address,
    recommendations: [],
    lookupMethod: 'none',
    failureReason: null,
  };

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { ...empty, failureReason: 'GEMINI_API_KEY assente' };
  }

  const model =
    process.env.FLORIST_SCOUT_GEMINI_MODEL?.trim() ||
    process.env.MARKETING_GEMINI_MODEL?.trim() ||
    'gemini-2.5-flash';

  const locationBlock = [
    `Cimitero: ${cemeteryName}`,
    `Comune: ${city}`,
    address ? `Indirizzo note: ${address}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const systemInstruction = [
    'Sei HYDRA/OSCAR — scout operativo FloreMoria per fioristi di prossimità ai cimiteri italiani.',
    'Usa Google Search e Google Maps per dati reali e aggiornati.',
    '',
    "REGOLA 1 — Vicinanza fisica assoluta: ordina per distanza dall'ingresso principale del cimitero.",
    'Chioschi sul piazzale o negozi a pochi metri dal cancello hanno priorità assoluta.',
    'REGOLA 2 — Telefono obbligatorio: includi SOLO attività con numero di telefono pubblico verificato.',
    'REGOLA 3 — Reputazione: a parità di distanza, preferisci rating/recensioni Google più alti.',
    '',
    'Restituisci SOLO JSON valido (nessun markdown) con chiavi cemetery e recommendations (max 3).',
    'Ogni recommendation: name, address, distanceMeters, distanceDescription, phone, rating, reviewsCount, aiReasoning, isDirectKiosk.',
  ].join('\n');

  const userPrompt = [
    'Seleziona i fioristi più vicini all ingresso del cimitero specificato.',
    'Includi esclusivamente attività con recapito telefonico verificato.',
    '',
    locationBlock,
  ].join('\n');

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
        // responseMimeType application/json + tools = 400 INVALID_ARGUMENT su Gemini.
        temperature: 0.2,
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return { ...empty, failureReason: 'Gemini: risposta vuota' };
    }

    let parsed: {
      cemetery?: string;
      recommendations?: Array<Partial<FloristScoutRecommendation>>;
    };
    try {
      parsed = JSON.parse(stripJsonFences(rawText));
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { ...empty, failureReason: 'Gemini: output non JSON' };
      }
      parsed = JSON.parse(stripJsonFences(jsonMatch[0]));
    }

    const rawItems = (parsed.recommendations || []).map((r) => ({
      name: String(r.name || '').trim(),
      address: String(r.address || '').trim(),
      distanceMeters: Math.max(0, Number(r.distanceMeters) || 99999),
      distanceDescription: String(r.distanceDescription || '').trim(),
      phone: String(r.phone || '').trim(),
      rating: Math.max(0, Math.min(5, Number(r.rating) || 0)),
      reviewsCount: Math.max(0, Math.floor(Number(r.reviewsCount) || 0)),
      aiReasoning: String(r.aiReasoning || '').trim(),
      isDirectKiosk: Boolean(r.isDirectKiosk),
    }));

    const recommendations = finalizeFloristScoutRecommendations(rawItems);

    console.info(
      `[FloristScout] ${cemeteryLabel} → ${recommendations.length} candidati (model=${model})`
    );

    const cemeteryRaw = parsed.cemetery;
    const cemeteryResolved =
      typeof cemeteryRaw === 'string' && cemeteryRaw.trim()
        ? cemeteryRaw.trim()
        : cemeteryLabel;

    return {
      cemetery: cemeteryResolved,
      city,
      cemeteryCity: city,
      cemeteryAddress: address,
      recommendations,
      lookupMethod: recommendations.length > 0 ? 'gemini' : 'none',
      failureReason:
        recommendations.length > 0 ? null : 'Gemini: nessun candidato con telefono verificato',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[FloristScout] Errore Gemini:', msg);
    return {
      ...empty,
      failureReason: `Gemini: ${msg.slice(0, 180)}`,
    };
  }
}

/**
 * Scout fioristi: Gemini (se disponibile) + fallback Google Places API.
 */
export async function findNearbyFloristsForCemetery(
  cemeteryNameOrInput:
    | string
    | {
        cemeteryName: string;
        city: string;
        address?: string | null;
        latitude?: number | null;
        longitude?: number | null;
      },
  cityArg?: string,
  addressArg?: string | null
): Promise<FloristScoutLookupResult> {
  const input =
    typeof cemeteryNameOrInput === 'string'
      ? {
          cemeteryName: cemeteryNameOrInput,
          city: cityArg || '',
          address: addressArg || null,
          latitude: null as number | null,
          longitude: null as number | null,
        }
      : cemeteryNameOrInput;

  const geminiResult = await findNearbyFloristsViaGemini(input);
  if (geminiResult.recommendations.length > 0) {
    return geminiResult;
  }

  const placesResult = await findNearbyFloristsViaGooglePlaces(input);
  if (placesResult.recommendations.length > 0) {
    return placesResult;
  }

  return {
    ...placesResult,
    failureReason:
      placesResult.failureReason ||
      geminiResult.failureReason ||
      'Nessun fiorista con telefono verificato',
  };
}
