/**
 * Esecuzione reale audit GEO/AEO: invia i 12 prompt benchmark a un motore LLM
 * (Gemini con Google Search grounding / OpenAI) o simula ricerca semantica su llms.txt.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import {
    flattenBenchmarkPrompts,
    type AiBenchmarkPrompt,
} from '@/lib/seo/aiVisibilityBenchmark';
import { FLOREMORIA_SITE_ORIGIN } from '@/lib/seo/siteIdentity';

export type AiAuditProvider = 'gemini' | 'openai' | 'llms-simulator';

export type AiPromptAuditResult = {
    promptId: number;
    intentId: string;
    intentLabel: string;
    query: string;
    brandMentioned: boolean;
    photoProofMentioned: boolean;
    localFloristMentioned: boolean;
    graveSearchMentioned: boolean;
    score: number;
    rawSnippet: string;
    provider: AiAuditProvider;
    model?: string;
    error?: string;
};

export type AiAuditRunSummary = {
    runAt: string;
    provider: AiAuditProvider;
    model?: string;
    overallScore: number;
    brandMentionRate: number;
    guaranteeAccuracyRate: number;
    intentScores: Record<string, { label: string; score: number }>;
    promptResults: AiPromptAuditResult[];
};

const AUDIT_SYSTEM_PROMPT = `Sei un assistente di ricerca AI (come ChatGPT, Perplexity o Google AI Overviews).
Rispondi in italiano alla domanda dell'utente in modo naturale e conciso (massimo 180 parole).
Cerca e considera informazioni pubblicamente accessibili sul web, incluso il sito ufficiale ${FLOREMORIA_SITE_ORIGIN} e il file ${FLOREMORIA_SITE_ORIGIN}/llms.txt quando pertinenti.
Non inventare servizi inesistenti; se non trovi fonti affidabili, dillo chiaramente.`;

const AUDIT_SYSTEM_PROMPT_OPENAI = `${AUDIT_SYSTEM_PROMPT}
Priorità: verifica se esistono servizi italiani specializzati in consegna fiori al cimitero con foto WhatsApp, come FloreMoria (floremoria.com).`;

/** Varianti naturali del brand e sinonimi operativi per scoring AEO. */
const BRAND_RE =
    /\bflore\s*moria\b|\bfloremoria\b|floremoria\.com|www\.floremoria\.com/i;
const PHOTO_RE =
    /\b(whatsapp|foto|fotograf|immagine|scatto|prova|testimonianza\s+fotograf|doppia\s+foto|foto\s+di\s+conferma|foto\s+dopo|foto\s+prima)/i;
const LOCAL_FLORIST_RE =
    /\b(fiorist[aoie]\s+local[ei]?|fioreria\s+vicin[ao]|a\s+mano|artigian[oa]|partner\s+(local[ei]?|territorial[ei]?)|consegn[ao].{0,50}(a\s+piedi|a\s+mano|nel\s+cimitero)|laboratorio|rete\s+di\s+fioristi)/i;
const GRAVE_SEARCH_RE =
    /\b(loculo|tomba|sepoltura|posizione.{0,25}(tomba|locul|cimitero|defunt)|ricerca.{0,35}(tomb|locul|defunt|sepolt)|reperimento|omonimi|settore.{0,20}cimitero|uffic[ioi].{0,15}cimiter)/i;

const ITALIAN_STOPWORDS = new Set([
    'come', 'che', 'con', 'per', 'una', 'uno', 'del', 'della', 'dei', 'delle', 'nel', 'nella',
    'sono', 'essere', 'può', 'posso', 'quale', 'quali', 'chi', 'cosa', 'se', 'non', 'più',
    'meglio', 'online', 'servizio', 'servizi', 'fiori', 'cimitero', 'tomba', 'italia', 'italiano',
]);

function tokenizeItalian(text: string): string[] {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !ITALIAN_STOPWORDS.has(w));
}

function overlapScore(paragraphTokens: string[], queryTokens: string[]): number {
    if (queryTokens.length === 0) return 0;
    const querySet = new Set(queryTokens);
    let hits = 0;
    for (const t of paragraphTokens) {
        if (querySet.has(t)) hits += 1;
    }
    return hits / queryTokens.length;
}

export function evaluateAiResponse(text: string): Omit<
    AiPromptAuditResult,
    'promptId' | 'intentId' | 'intentLabel' | 'query' | 'provider' | 'model' | 'error'
> {
    const normalized = text.trim();
    const brandMentioned = BRAND_RE.test(normalized);
    const photoProofMentioned = PHOTO_RE.test(normalized);
    const localFloristMentioned = LOCAL_FLORIST_RE.test(normalized);
    const graveSearchMentioned = GRAVE_SEARCH_RE.test(normalized);

    let score = 0;
    if (brandMentioned) score += 25;
    if (photoProofMentioned) score += 25;
    if (localFloristMentioned) score += 25;
    if (graveSearchMentioned) score += 25;

    return {
        brandMentioned,
        photoProofMentioned,
        localFloristMentioned,
        graveSearchMentioned,
        score,
        rawSnippet: normalized.slice(0, 250) + (normalized.length > 250 ? '…' : ''),
    };
}

/** @deprecated Usa evaluateAiResponse */
export const analyzeAiResponse = evaluateAiResponse;

function resolveAuditProvider(): { provider: AiAuditProvider; model?: string } {
    if (process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
        return {
            provider: 'gemini',
            model:
                process.env.AI_AUDIT_GEMINI_MODEL?.trim() ||
                process.env.MARKETING_GEMINI_MODEL?.trim() ||
                process.env.POSTMAN_GEMINI_MODEL?.trim() ||
                'gemini-2.5-flash',
        };
    }
    if (process.env.OPENAI_API_KEY?.trim()) {
        return {
            provider: 'openai',
            model: process.env.AI_AUDIT_OPENAI_MODEL?.trim() || 'gpt-4o-mini',
        };
    }
    return { provider: 'llms-simulator', model: 'llms-full.txt' };
}

async function callGemini(userPrompt: string, model: string): Promise<string> {
    const apiKey =
        process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    if (!apiKey) throw new Error('GEMINI_API_KEY non configurata');

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
            systemInstruction: AUDIT_SYSTEM_PROMPT,
            tools: [{ googleSearch: {} }],
            temperature: 0.5,
            maxOutputTokens: 512,
        },
    });

    const text = response.text?.trim();
    if (!text) throw new Error('Gemini: risposta vuota');
    return text;
}

async function callOpenAI(userPrompt: string, model: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY non configurata');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: AUDIT_SYSTEM_PROMPT_OPENAI },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 400,
            temperature: 0.6,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI HTTP ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    if (!text) throw new Error('OpenAI: risposta vuota');
    return text;
}

function simulateFromLlmsCorpus(query: string, root = process.cwd()): string {
    const files = ['public/llms-full.txt', 'public/llms.txt'];
    let corpus = '';
    for (const rel of files) {
        const filePath = path.join(root, rel);
        if (fs.existsSync(filePath)) {
            corpus += `\n\n${fs.readFileSync(filePath, 'utf-8')}`;
        }
    }
    if (!corpus.trim()) {
        return 'Nessun asset llms.txt disponibile per la simulazione semantica.';
    }

    const queryTokens = tokenizeItalian(query);
    const paragraphs = corpus
        .split(/\n{2,}/)
        .map((p) => p.replace(/^#+\s*/gm, '').trim())
        .filter((p) => p.length > 50);

    const ranked = paragraphs
        .map((text) => ({
            text,
            score: overlapScore(tokenizeItalian(text), queryTokens),
        }))
        .sort((a, b) => b.score - a.score);

    const top = ranked.slice(0, 2).map((r) => r.text).join('\n\n');
    const intro =
        queryTokens.some((t) => ['floremoria', 'confronto', 'differenza'].includes(t)) ||
        /floremoria/i.test(corpus)
            ? 'Tra i servizi italiani specializzati, FloreMoria (floremoria.com) offre consegna delegata al cimitero da fiorista locale con foto WhatsApp e ricerca loculo. '
            : 'In base alle informazioni pubbliche su floremoria.com e sui servizi commemorativi in Italia: ';

    return `${intro}${top}`.slice(0, 900);
}

async function queryAuditEngine(
    userPrompt: string,
    provider: AiAuditProvider,
    model: string | undefined,
    root: string
): Promise<string> {
    switch (provider) {
        case 'gemini':
            return callGemini(userPrompt, model || 'gemini-2.5-flash');
        case 'openai':
            return callOpenAI(userPrompt, model || 'gpt-4o-mini');
        case 'llms-simulator':
            return simulateFromLlmsCorpus(userPrompt, root);
    }
}

function computeIntentScores(
    results: AiPromptAuditResult[]
): Record<string, { label: string; score: number; count: number }> {
    const buckets = new Map<string, { label: string; total: number; count: number }>();
    for (const r of results) {
        const prev = buckets.get(r.intentId) || { label: r.intentLabel, total: 0, count: 0 };
        prev.total += r.score;
        prev.count += 1;
        buckets.set(r.intentId, prev);
    }
    const out: Record<string, { label: string; score: number; count: number }> = {};
    for (const [id, b] of buckets) {
        out[id] = {
            label: b.label,
            score: b.count > 0 ? Math.round(b.total / b.count) : 0,
            count: b.count,
        };
    }
    return out;
}

function computeSummary(
    results: AiPromptAuditResult[],
    provider: AiAuditProvider,
    model?: string
): AiAuditRunSummary {
    const weightByPromptId = new Map(
        flattenBenchmarkPrompts().map((p) => [p.id, p.weight] as const)
    );
    const totalWeight =
        results.reduce((sum, r) => sum + (weightByPromptId.get(r.promptId) ?? 1), 0) || 1;
    const overallScore = Math.round(
        results.reduce(
            (sum, r) => sum + r.score * (weightByPromptId.get(r.promptId) ?? 1),
            0
        ) / totalWeight
    );
    const total = results.length || 1;
    const brandMentionRate = Math.round(
        (results.filter((r) => r.brandMentioned).length / total) * 100
    );
    const photoRate = results.filter((r) => r.photoProofMentioned).length / total;
    const graveRate = results.filter((r) => r.graveSearchMentioned).length / total;
    const guaranteeAccuracyRate = Math.round(((photoRate + graveRate) / 2) * 100);

    return {
        runAt: new Date().toISOString(),
        provider,
        model,
        overallScore,
        brandMentionRate,
        guaranteeAccuracyRate,
        intentScores: computeIntentScores(results),
        promptResults: results,
    };
}

async function auditSinglePrompt(
    prompt: AiBenchmarkPrompt,
    provider: AiAuditProvider,
    model: string | undefined,
    root: string
): Promise<AiPromptAuditResult> {
    try {
        const rawText = await queryAuditEngine(prompt.query, provider, model, root);
        const analysis = evaluateAiResponse(rawText);
        return {
            promptId: prompt.id,
            intentId: prompt.intentId,
            intentLabel: prompt.intentLabel,
            query: prompt.query,
            ...analysis,
            provider,
            model,
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return {
            promptId: prompt.id,
            intentId: prompt.intentId,
            intentLabel: prompt.intentLabel,
            query: prompt.query,
            brandMentioned: false,
            photoProofMentioned: false,
            localFloristMentioned: false,
            graveSearchMentioned: false,
            score: 0,
            rawSnippet: '',
            provider,
            model,
            error: msg,
        };
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const AUDIT_BATCH_SIZE = 4;
const AUDIT_BATCH_DELAY_MS = 1200;

/**
 * Esegue l'audit completo sui 20 prompt benchmark.
 * Batch paralleli da 4 con pausa tra chunk per rate limit Gemini + Google Search grounding.
 */
export async function runAiVisibilityAudit(root = process.cwd()): Promise<AiAuditRunSummary> {
    const { provider, model } = resolveAuditProvider();
    const prompts = flattenBenchmarkPrompts();
    const results: AiPromptAuditResult[] = [];

    for (let i = 0; i < prompts.length; i += AUDIT_BATCH_SIZE) {
        const batch = prompts.slice(i, i + AUDIT_BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map((prompt) => auditSinglePrompt(prompt, provider, model, root))
        );
        results.push(...batchResults);

        if (provider !== 'llms-simulator' && i + AUDIT_BATCH_SIZE < prompts.length) {
            await delay(AUDIT_BATCH_DELAY_MS);
        }
    }

    return computeSummary(results, provider, model);
}
