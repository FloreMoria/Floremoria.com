/**
 * Florist Scout AI — HYDRA/OSCAR: fioristi di prossimità al cimitero via Gemini + Google Search/Maps.
 * Regola assoluta: distanza dall'ingresso principale, telefono obbligatorio, rating come tie-breaker.
 */
import { GoogleGenAI } from '@google/genai';
import {
  finalizeFloristScoutRecommendations,
  type FloristScoutRecommendation,
  type FloristScoutResult,
} from '@/lib/ai/floristScoutTypes';

const SCOUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    cemetery: { type: 'string' },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: { type: 'string' },
          distanceMeters: { type: 'number' },
          distanceDescription: { type: 'string' },
          phone: { type: 'string' },
          rating: { type: 'number' },
          reviewsCount: { type: 'number' },
          aiReasoning: { type: 'string' },
          isDirectKiosk: { type: 'boolean' },
        },
        required: [
          'name',
          'address',
          'distanceMeters',
          'distanceDescription',
          'phone',
          'aiReasoning',
        ],
      },
    },
  },
  required: ['cemetery', 'recommendations'],
} as const;

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

/**
 * Interroga Gemini (Google Search + Maps grounding) per i 3 fioristi più vicini
 * all'ingresso del cimitero, con telefono verificato.
 * Supporta sia la firma (cemeteryName, city, address) sia la firma a oggetto.
 */
export async function findNearbyFloristsForCemetery(
  cemeteryNameOrInput: string | { cemeteryName: string; city: string; address?: string | null },
  cityArg?: string,
  addressArg?: string | null
): Promise<FloristScoutResult> {
  const input =
    typeof cemeteryNameOrInput === 'string'
      ? {
          cemeteryName: cemeteryNameOrInput,
          city: cityArg || '',
          address: addressArg || null,
        }
      : cemeteryNameOrInput;

  const cemeteryName = input.cemeteryName.trim();
  const city = input.city.trim();
  const address = input.address?.trim() || null;
  const cemeteryLabel = [cemeteryName, city].filter(Boolean).join(', ');

  const empty: FloristScoutResult = {
    cemetery: cemeteryLabel,
    city,
    cemeteryCity: city,
    cemeteryAddress: address,
    recommendations: [],
  };

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.warn('[FloristScout] GEMINI_API_KEY assente — skip scout.');
    return empty;
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
    'REGOLA 1 — Vicinanza fisica assoluta: ordina per distanza dall\'ingresso principale del cimitero.',
    'Chioschi sul piazzale o negozi a pochi metri dal cancello hanno priorità assoluta (rank implicito per distanza).',
    'REGOLA 2 — Telefono obbligatorio: includi SOLO attività con numero di telefono pubblico verificato (no placeholder).',
    'REGOLA 3 — Reputazione: a parità di distanza, preferisci rating/recensioni Google più alti; spiega in aiReasoning.',
    '',
    'Restituisci al massimo 3 candidati, già ordinati dal più vicino al più lontano.',
    'distanceDescription in italiano naturale (es. "Di fronte all\'ingresso principale", "150 m dal cancello est").',
    'isDirectKiosk=true per chioschi/banchetti sul piazzale del cimitero.',
    'aiReasoning: una frase sobria in italiano (prossimità + eventuale rating).',
  ].join('\n');

  const userPrompt = [
    'Seleziona i fioristi più vicini all\'ingresso del cimitero specificato.',
    'Ordina prioritariamente in base alla vicinanza fisica all\'ingresso (chioschi sul piazzale o negozi a pochi metri hanno priorità assoluta).',
    'Includi esclusivamente attività con recapito telefonico verificato.',
    'Aggiungi punteggio recensioni Google e sintesi aiReasoning.',
    '',
    locationBlock,
    '',
    'Output JSON conforme allo schema richiesto.',
  ].join('\n');

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
        responseMimeType: 'application/json',
        responseJsonSchema: SCOUT_JSON_SCHEMA,
        temperature: 0.2,
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      console.warn('[FloristScout] Risposta Gemini vuota.');
      return empty;
    }

    const parsed = JSON.parse(stripJsonFences(rawText)) as {
      cemetery?: string;
      recommendations?: Array<Partial<FloristScoutRecommendation>>;
    };

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

    return {
      cemetery: parsed.cemetery?.trim() || cemeteryLabel,
      city,
      cemeteryCity: city,
      cemeteryAddress: address,
      recommendations,
    };
  } catch (err) {
    console.error('[FloristScout] Errore Gemini:', err instanceof Error ? err.message : err);
    return empty;
  }
}
