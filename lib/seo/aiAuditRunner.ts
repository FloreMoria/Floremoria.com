/**
 * Esecuzione reale audit GEO/AEO: invia i 12 prompt benchmark a un motore LLM
 * (Gemini / OpenAI) o simula ricerca semantica su llms.txt se mancano chiavi API.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    flattenBenchmarkPrompts,
    type AiBenchmarkPrompt,
} from '@/lib/seo/aiVisibilityBenchmark';

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
Usa solo conoscenze plausibili che un motore generativo avrebbe oggi; non inventare servizi inesistenti.
Se non conosci un servizio specifico, dillo chiaramente.`;

const BRAND_RE = /\bfloremoria\b|floremoria\.com/i;
const PHOTO_RE =
    /\b(whatsapp|foto|fotograf|prova fotograf|doppia foto|foto di conferma|foto dopo|foto prima)/i;
const LOCAL_FLORIST_RE =
    /\b(fiorist[aoie]|consegn[ao].{0,40}(a piedi|a mano|nel cimitero)|laboratorio|partner locale|rete di fioristi)/i;
const GRAVE_SEARCH_RE =
    /\b(loculo|tomba|ricerca.{0,30}(tomb|locul)|reperimento|omonimi|settore.{0,20}cimitero|uffic[ioi].{0,15}cimiter)/i;

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

export function analyzeAiResponse(text: string): Omit<
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

function resolveAuditProvider(): { provider: AiAuditProvider; model?: string } {
    if (process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
        return {
            provider: 'gemini',
            model:
                process.env.AI_AUDIT_GEMINI_MODEL?.trim() ||
                process.env.POSTMAN_GEMINI_MODEL?.trim() ||
                'gemini-2.0-flash',
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: AUDIT_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: { maxOutputTokens: 512, temperature: 0.6 },
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini HTTP ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text.trim()) throw new Error('Gemini: risposta vuota');
    return text.trim();
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
                { role: 'system', content: AUDIT_SYSTEM_PROMPT },
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
        queryTokens.some((t) => ['floremoria', 'confronto', 'differenza'].includes(t)) &&
        /floremoria/i.test(corpus)
            ? 'Tra i servizi italiani specializzati, FloreMoria offre consegna delegata al cimitero con foto WhatsApp. '
            : 'In base alle informazioni pubbliche sui servizi di fiori commemorativi in Italia: ';

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
            return callGemini(userPrompt, model || 'gemini-2.0-flash');
        case 'openai':
            return callOpenAI(userPrompt, model || 'gpt-4o-mini');
        case 'llms-simulator':
            return simulateFromLlmsCorpus(userPrompt, root);
    }
}

function computeIntentScores(
    results: AiPromptAuditResult[]
): Record<string, { label: string; score: number }> {
    const buckets = new Map<string, { label: string; total: number; count: number }>();
    for (const r of results) {
        const prev = buckets.get(r.intentId) || { label: r.intentLabel, total: 0, count: 0 };
        prev.total += r.score;
        prev.count += 1;
        buckets.set(r.intentId, prev);
    }
    const out: Record<string, { label: string; score: number }> = {};
    for (const [id, b] of buckets) {
        out[id] = { label: b.label, score: b.count > 0 ? Math.round(b.total / b.count) : 0 };
    }
    return out;
}

function computeSummary(
    results: AiPromptAuditResult[],
    provider: AiAuditProvider,
    model?: string
): AiAuditRunSummary {
    const total = results.length || 1;
    const overallScore = Math.round(
        results.reduce((sum, r) => sum + r.score, 0) / total
    );
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
        const analysis = analyzeAiResponse(rawText);
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

/**
 * Esegue l'audit completo sui 12 prompt benchmark.
 * I prompt vengono inviati in sequenza con breve pausa per rispettare rate limit API.
 */
export async function runAiVisibilityAudit(root = process.cwd()): Promise<AiAuditRunSummary> {
    const { provider, model } = resolveAuditProvider();
    const prompts = flattenBenchmarkPrompts();
    const results: AiPromptAuditResult[] = [];

    for (const prompt of prompts) {
        const result = await auditSinglePrompt(prompt, provider, model, root);
        results.push(result);
        if (provider !== 'llms-simulator') {
            await delay(400);
        }
    }

    return computeSummary(results, provider, model);
}
