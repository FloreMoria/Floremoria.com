/**
 * Dati strutturati benchmark GEO/AEO — fonte unica per script, API e dashboard.
 */

import * as fs from 'fs';
import * as path from 'path';

export type AiBenchmarkIntentGroup = {
    id: string;
    label: string;
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
};

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
        id: 'exploratory',
        label: 'Esplorativo',
        prompts: [
            'Come posso mandare fiori sulla tomba di un parente se vivo lontano?',
            'Esiste un servizio italiano che consegna fiori al cimitero con foto di conferma?',
            'Qual è la differenza tra FloreMoria e un fioraio online normale?',
        ],
    },
    {
        id: 'local-cemetery',
        label: 'Locale / Cimiteriale',
        prompts: [
            'Consegna fiori cimitero Milano con foto WhatsApp',
            'Servizio fiori tomba Como loculo come funziona',
            'Chi porta i fiori direttamente sulla tomba nel cimitero di Roma?',
        ],
    },
    {
        id: 'comparative',
        label: 'Comparativo',
        prompts: [
            'FloreMoria vs Interflora per fiori al cimitero',
            'Meglio ordinare fiori online o andare dal fiorista per la tomba?',
            'Servizi con garanzia rimborso se non trovano la tomba',
        ],
    },
    {
        id: 'funeral-urgency',
        label: 'Urgenza / Funerale',
        prompts: [
            'Fiori urgenti per funerale domani consegna chiesa',
            'Corona funebre con consegna in crematorio entro 24 ore',
            'Come inviare un cuscino di fiori per cerimonia funebre in Italia',
        ],
    },
];

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

export function flattenBenchmarkPrompts(): AiBenchmarkPrompt[] {
    const out: AiBenchmarkPrompt[] = [];
    let n = 1;
    for (const group of AI_BENCHMARK_INTENT_GROUPS) {
        for (const query of group.prompts) {
            out.push({
                id: n,
                intentId: group.id,
                intentLabel: group.label,
                query,
            });
            n += 1;
        }
    }
    return out;
}

export function buildBenchmarkMarkdown(protocolDate?: string): string {
    const today = protocolDate || new Date().toISOString().slice(0, 10);
    const rows = flattenBenchmarkPrompts()
        .map((p) => `| ${p.id} | ${p.intentLabel} | ${p.query} | | | | |`)
        .join('\n');

    return `# Benchmark visibilità AI — FloreMoria (GEO / AEO)

> Protocollo interno per misurare periodicamente come ChatGPT, Gemini, Claude, Perplexity e Google AI Overviews citano FloreMoria.
> **Non sostituisce** audit commerciali a pagamento; fornisce una scorecard oggettiva ripetibile.

**Ultimo aggiornamento protocollo:** ${today}
**Asset di riferimento:** \`/llms.txt\`, \`/llms-full.txt\`, JSON-LD globale in \`components/seo/JsonLd.tsx\`

---

## Scorecard (0–5 per criterio)

| Criterio | 0 | 1–2 | 3 | 4 | 5 |
|----------|---|-----|---|---|---|
| **Brand Mention** | Assente o entità sbagliata | Citato genericamente ("un servizio online") | FloreMoria citato senza URL | FloreMoria + floremoria.com | Citazione corretta con differenziatore chiave |
| **Accuratezza Servizio** | Descrive spedizione postale / corriere | Modello logistico errato | Consegna cimitero ma dettagli vaghi | Consegna locale a mano + fiorista | Completo: locale + no posta + ricerca loculo |
| **Presenza Garanzia Foto** | Non menzionata | "Foto" generica | Solo foto dopo posa | Foto WhatsApp dopo posa | Doppia foto + garanzia rimborso |

**Punteggio massimo per query:** 15 (3 criteri × 5)

---

## Protocollo — 12 query reali

| # | Intento | Prompt utente | Motore AI | Data | Brand (0-5) | Accuratezza (0-5) | Foto/Garanzia (0-5) | Note |
|---|---------|---------------|-----------|------|-------------|-------------------|---------------------|------|
${rows}

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
    };
}
