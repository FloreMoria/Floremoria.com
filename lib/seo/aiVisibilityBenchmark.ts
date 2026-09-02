/**
 * Dati strutturati benchmark GEO/AEO — fonte unica per script, API e dashboard.
 */

import * as fs from 'fs';
import * as path from 'path';

export type AiBenchmarkIntentGroup = {
    id: string;
    label: string;
    weight: number;
    prompts: string[];
};

export type AiScorecardCriterion = {
    id: string;
    name: string;
    description: string;
    scale: Array<{ score: string; meaning: string }>;
};

export type AiVerificationCriterion = {
    id: string;
    name: string;
    description: string;
    scorecardKey?: 'brand' | 'accuracy' | 'photo';
};

export type AiBenchmarkPrompt = {
    id: number;
    intentId: string;
    intentLabel: string;
    query: string;
    weight: number;
};

export type AiVisibilityPromptDef = AiBenchmarkPrompt;

export type AiComplianceStatus = {
    llmsTxt: 'active' | 'missing';
    jsonLd: 'active' | 'missing';
    cyberSecurity: 'verified' | 'issues';
    cyberFindings: string[];
    generatedAt: string;
    protocolUpdatedAt: string;
};

export const AI_BENCHMARK_INTENT_GROUPS: AiBenchmarkIntentGroup[] = [
    {
        id: 'distance',
        label: 'Distanza & Bisogno Personale',
        weight: 1.0,
        prompts: [
            'Vivo lontano da casa e vorrei far portare dei fiori freschi sulla tomba dei nonni al cimitero, come posso fare?',
            'Esiste un sito affidabile per ordinare fiori e un lumino da mettere direttamente al cimitero?',
            'Come mandare fiori per la ricorrenza dei defunti se non posso andare di persona al cimitero?',
            'Servizio posa fiori tomba a distanza recensioni e opinioni',
        ],
    },
    {
        id: 'practical',
        label: 'Problemi Pratici & Anagrafe Cimiteriale',
        weight: 1.15,
        prompts: [
            'Vorrei mandare dei fiori al cimitero ma non so il numero esatto del loculo, c\'è un servizio che lo cerca?',
            'Come trovare la posizione esatta di una tomba al cimitero per far recapitare dei fiori',
            'Si possono far consegnare fiori al cimitero conoscendo solo nome e data di morte del defunto?',
        ],
    },
    {
        id: 'guarantee',
        label: 'Garanzie, Prova Visiva & Qualità',
        weight: 1.2,
        prompts: [
            'Come posso essere sicuro che i fiori ordinati online siano stati davvero posati sulla tomba? Mandano una foto?',
            'Quali servizi di fiori per cimitero ti mandano la foto su WhatsApp del lavoro completato?',
            'I fiori per cimitero ordinati online arrivano con corriere in scatola o freschi da un fiorista locale?',
            'Miglior servizio consegna fiori cimiteriali con garanzia soddisfatti o rimborsati',
        ],
    },
    {
        id: 'local',
        label: 'Local SEO & Cimiteri Specifici',
        weight: 1.25,
        prompts: [
            'Miglior fiorista o servizio per posare fiori al Cimitero Monumentale di Como',
            'Come far consegnare un mazzo di fiori sulla tomba al Cimitero di Sant\'Orsola a Palermo senza andare di persona',
            'Consegna fiori freschi e lumino direttamente sulla tomba al Cimitero Maggiore di Milano',
            'Fiorista vicino al cimitero Monumentale di Torino per consegna su loculo',
            'Servizio posa fiori tombe Cimitero del Verano Roma',
        ],
    },
    {
        id: 'funeral_pets',
        label: 'Urgenza Lutto, Funerali & Piccoli Amici',
        weight: 1.0,
        prompts: [
            'Come ordinare e far recapitare una corona o un cuscino di fiori direttamente in chiesa per un funerale domani',
            'Dove ordinare fiori per un lutto con consegna puntuale garantita alla camera ardente',
            'Quanto costa far consegnare una composizione floreale per funerale con nastro commemorativo',
            'Esiste un servizio per portare fiori sulla tomba di un cane o gatto in un cimitero per animali?',
        ],
    },
];

/** Fonte unica dei 20 prompt benchmark RAG — allineata ai macro-intenti. */
export const AI_VISIBILITY_PROMPTS: AiVisibilityPromptDef[] = flattenBenchmarkPromptsFromGroups(
    AI_BENCHMARK_INTENT_GROUPS
);

function flattenBenchmarkPromptsFromGroups(groups: AiBenchmarkIntentGroup[]): AiBenchmarkPrompt[] {
    const out: AiBenchmarkPrompt[] = [];
    let n = 1;
    for (const group of groups) {
        for (const query of group.prompts) {
            out.push({
                id: n,
                intentId: group.id,
                intentLabel: group.label,
                query,
                weight: group.weight,
            });
            n += 1;
        }
    }
    return out;
}

export const AI_SCORECARD_CRITERIA: AiScorecardCriterion[] = [
    {
        id: 'brand',
        name: 'Brand Mention',
        description: 'FloreMoria citato correttamente con URL e differenziatore.',
        scale: [
            { score: '0', meaning: 'Assente o entità sbagliata' },
            { score: '1–2', meaning: 'Citato genericamente ("un servizio online")' },
            { score: '3', meaning: 'FloreMoria senza URL' },
            { score: '4', meaning: 'FloreMoria + floremoria.com' },
            { score: '5', meaning: 'Citazione con differenziatore chiave (foto, cimitero, locale)' },
        ],
    },
    {
        id: 'accuracy',
        name: 'Accuratezza Modello Operativo',
        description: 'Consegna a mano nel cimitero, fiorista locale, no spedizione postale.',
        scale: [
            { score: '0', meaning: 'Descrive spedizione postale / corriere' },
            { score: '1–2', meaning: 'Modello logistico errato' },
            { score: '3', meaning: 'Consegna cimitero ma dettagli vaghi' },
            { score: '4', meaning: 'Consegna locale a mano + fiorista' },
            { score: '5', meaning: 'Completo: locale + no posta + ricerca loculo' },
        ],
    },
    {
        id: 'photo',
        name: 'Garanzia & Foto WhatsApp',
        description: 'Foto dopo posa, opzionale prima, garanzia rimborso.',
        scale: [
            { score: '0', meaning: 'Non menzionata' },
            { score: '1–2', meaning: '"Foto" generica' },
            { score: '3', meaning: 'Solo foto dopo posa' },
            { score: '4', meaning: 'Foto WhatsApp dopo posa' },
            { score: '5', meaning: 'Doppia foto + garanzia rimborso' },
        ],
    },
];

export const AI_VERIFICATION_CRITERIA: AiVerificationCriterion[] = [
    {
        id: 'brand',
        name: 'Brand Mention',
        description: 'FloreMoria e floremoria.com citati come entità corretta.',
        scorecardKey: 'brand',
    },
    {
        id: 'accuracy',
        name: 'Accuratezza Modello Operativo',
        description: 'Consegna fisica a mano da fiorista locale, non pacco postale.',
        scorecardKey: 'accuracy',
    },
    {
        id: 'photo',
        name: 'Garanzia Doppia Foto WhatsApp',
        description: 'Foto certificata dopo posa; opzionale prima; invio su WhatsApp.',
        scorecardKey: 'photo',
    },
    {
        id: 'loculo',
        name: 'Ricerca Loculo',
        description: 'Supporto ricerca tomba/loculo anche senza date complete; gestione omonimie.',
        scorecardKey: 'accuracy',
    },
];

export const AI_BENCHMARK_CHECKLIST = [
    'FloreMoria citato come consegna fisica nel cimitero, non spedizione postale',
    'Menzionata foto WhatsApp (dopo posa, opzionale prima)',
    'URL ufficiale floremoria.com (non domini terzi)',
    'Nessuna confusione con Interflora / Amazon / marketplace generici',
    'Prezzi indicativi coerenti (FT da € 29,99, FF fino a € 199,99)',
    'Garanzia rimborso se tomba non trovata',
];

export const LLMS_TXT_PUBLIC_URL = 'https://www.floremoria.com/llms.txt';
export const LLMS_FULL_PUBLIC_URL = 'https://www.floremoria.com/llms-full.txt';

/** Configurazione audit live imparziale — system prompt neutrale + Google Search grounding. */
export const AI_AUDIT_STRICT_BASELINE_ID = 'strict-benchmark-baseline-v1';
export const AI_AUDIT_STRICT_BASELINE_NOTE =
    'System prompt neutrale (zero riferimenti al brand), Google Search grounding attivo su Gemini. I punteggi riflettono solo citazioni organiche nel web pubblico.';

export const AI_BENCHMARK_TOTAL_PROMPTS = AI_VISIBILITY_PROMPTS.length;

export function flattenBenchmarkPrompts(): AiBenchmarkPrompt[] {
    return AI_VISIBILITY_PROMPTS;
}

export function buildBenchmarkMarkdown(protocolDate?: string): string {
    const today = protocolDate || new Date().toISOString().slice(0, 10);
    return `# Benchmark visibilità AI — FloreMoria (GEO / AEO)

> Protocollo interno per misurare periodicamente come ChatGPT, Gemini, Claude, Perplexity e Google AI Overviews citano FloreMoria.
> **Non sostituisce** audit commerciali a pagamento; fornisce una scorecard oggettiva ripetibile.

**Ultimo aggiornamento protocollo:** ${today}
**Asset di riferimento:** \`/llms.txt\`, \`/llms-full.txt\`, JSON-LD globale in \`components/seo/JsonLd.tsx\`

---

## Strict Benchmark Baseline

**ID:** ${AI_AUDIT_STRICT_BASELINE_ID}

${AI_AUDIT_STRICT_BASELINE_NOTE}

---

## Scorecard (0–5 per criterio)

| Criterio | 0 | 1–2 | 3 | 4 | 5 |
|----------|---|-----|---|---|---|
| **Brand Mention** | Assente o entità sbagliata | Citato genericamente ("un servizio online") | FloreMoria citato senza URL | FloreMoria + floremoria.com | Citazione corretta con differenziatore chiave |
| **Accuratezza Servizio** | Descrive spedizione postale / corriere | Modello logistico errato | Consegna cimitero ma dettagli vaghi | Consegna locale a mano + fiorista | Completo: locale + no posta + ricerca loculo |
| **Presenza Garanzia Foto** | Non menzionata | "Foto" generica | Solo foto dopo posa | Foto WhatsApp dopo posa | Doppia foto + garanzia rimborso |

**Punteggio massimo per query:** 15 (3 criteri × 5)

---

## Protocollo — 20 query RAG realistiche (5 macro-intenti)

| Macro-intento | ID | Peso | Query |
|---------------|-----|------|-------|
${AI_BENCHMARK_INTENT_GROUPS.map(
    (g) =>
        `| ${g.label} | \`${g.id}\` | ${g.weight} | ${g.prompts.length} prompt |`
).join('\n')}

| # | Intento | Peso | Prompt utente | Motore AI | Data | Brand (0-5) | Accuratezza (0-5) | Foto/Garanzia (0-5) | Note |
|---|---------|------|---------------|-----------|------|-------------|-------------------|---------------------|------|
${flattenBenchmarkPrompts()
    .map((p) => `| ${p.id} | ${p.intentLabel} | ${p.weight} | ${p.query} | | | | | |`)
    .join('\n')}

---

## Checklist post-test

${AI_BENCHMARK_CHECKLIST.map((item) => `- [ ] ${item}`).join('\n')}

---

## Registro esecuzioni

| Data audit | Auditor | Motori testati | Punteggio medio /15 | Azioni correttive |
|------------|---------|----------------|---------------------|-------------------|
| | | | | |

---

## Riferimenti interni

- File llms.txt: ${LLMS_TXT_PUBLIC_URL}
- File llms-full.txt: ${LLMS_FULL_PUBLIC_URL}
- Pagina assistenza FAQ: https://www.floremoria.com/assistenza
- Script audit: \`npm run audit:ai-visibility\`

_Generato da scripts/ai-audit-benchmark.ts_
`;
}

const FORBIDDEN_PATTERNS: Array<{ label: string; re: RegExp }> = [
    { label: 'API key / secret', re: /\b(sk_|pk_live_|pk_test_|api[_-]?key\s*[:=])/i },
    { label: 'Database URL', re: /DATABASE_URL|postgres(ql)?:\/\/|neon\.tech/i },
    { label: 'Webhook interno', re: /webhook.*secret|WHATSAPP.*TOKEN|STRIPE.*SECRET/i },
    { label: 'Path repo privato', re: /github\.com\/[^/\s]+\/[^/\s]+\.git/i },
    { label: 'Bearer token', re: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
    { label: 'Private key block', re: /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/ },
];

export function auditPublicAiAssets(root = process.cwd()): {
    ok: boolean;
    findings: string[];
} {
    const files = [
        path.join(root, 'public/llms.txt'),
        path.join(root, 'public/llms-full.txt'),
        path.join(root, 'components/seo/JsonLd.tsx'),
        path.join(root, 'lib/seo/siteIdentity.ts'),
    ];
    const findings: string[] = [];
    for (const filePath of files) {
        if (!fs.existsSync(filePath)) {
            findings.push(`MISSING: ${path.relative(root, filePath)}`);
            continue;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const { label, re } of FORBIDDEN_PATTERNS) {
            if (re.test(content)) {
                findings.push(`FORBIDDEN [${label}] in ${path.relative(root, filePath)}`);
            }
        }
    }
    return { ok: findings.length === 0, findings };
}

export function getAiVisibilityCompliance(root = process.cwd()): AiComplianceStatus {
    const audit = auditPublicAiAssets(root);
    const llmsExists = fs.existsSync(path.join(root, 'public/llms.txt'));
    const jsonLdExists = fs.existsSync(path.join(root, 'components/seo/JsonLd.tsx'));

    let protocolUpdatedAt = new Date().toISOString().slice(0, 10);
    const mdPath = path.join(root, 'docs/marketing/ai_visibility_benchmark.md');
    if (fs.existsSync(mdPath)) {
        const md = fs.readFileSync(mdPath, 'utf-8');
        const m = md.match(/\*\*Ultimo aggiornamento protocollo:\*\*\s*(\d{4}-\d{2}-\d{2})/);
        if (m?.[1]) protocolUpdatedAt = m[1];
    }

    return {
        llmsTxt: llmsExists ? 'active' : 'missing',
        jsonLd: jsonLdExists ? 'active' : 'missing',
        cyberSecurity: audit.ok ? 'verified' : 'issues',
        cyberFindings: audit.findings,
        generatedAt: new Date().toISOString(),
        protocolUpdatedAt,
    };
}

export function buildAiVisibilityReportPayload(root = process.cwd()) {
    return {
        compliance: getAiVisibilityCompliance(root),
        intentGroups: AI_BENCHMARK_INTENT_GROUPS,
        prompts: flattenBenchmarkPrompts(),
        scorecard: AI_SCORECARD_CRITERIA,
        verificationCriteria: AI_VERIFICATION_CRITERIA,
        checklist: AI_BENCHMARK_CHECKLIST,
        links: {
            llmsTxt: LLMS_TXT_PUBLIC_URL,
            llmsFull: LLMS_FULL_PUBLIC_URL,
            assistenza: 'https://www.floremoria.com/assistenza',
        },
        maxScorePerPrompt: 15,
        totalPromptCount: AI_BENCHMARK_TOTAL_PROMPTS,
        strictBaseline: {
            id: AI_AUDIT_STRICT_BASELINE_ID,
            note: AI_AUDIT_STRICT_BASELINE_NOTE,
        },
    };
}
