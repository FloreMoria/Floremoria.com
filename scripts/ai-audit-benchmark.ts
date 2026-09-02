#!/usr/bin/env tsx
/**
 * Benchmark interno visibilità AI (GEO/AEO) — protocollo query + scorecard.
 * Eseguire: npm run audit:ai-visibility
 *
 * Non chiama API LLM esterne: genera/aggiorna il protocollo di test manuale
 * e verifica che gli asset pubblici non espongano segreti.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const BENCHMARK_PATH = path.join(ROOT, 'docs/marketing/ai_visibility_benchmark.md');
const PUBLIC_ASSETS = [
    path.join(ROOT, 'public/llms.txt'),
    path.join(ROOT, 'public/llms-full.txt'),
    path.join(ROOT, 'components/seo/JsonLd.tsx'),
    path.join(ROOT, 'lib/seo/siteIdentity.ts'),
];

/** Pattern vietati in asset pubblici (cyber security audit). */
const FORBIDDEN_PATTERNS: Array<{ label: string; re: RegExp }> = [
    { label: 'API key / secret', re: /\b(sk_|pk_live_|pk_test_|api[_-]?key\s*[:=])/i },
    { label: 'Database URL', re: /DATABASE_URL|postgres(ql)?:\/\/|neon\.tech/i },
    { label: 'Webhook interno', re: /webhook.*secret|WHATSAPP.*TOKEN|STRIPE.*SECRET/i },
    { label: 'Path repo privato', re: /github\.com\/[^/\s]+\/[^/\s]+\.git/i },
    { label: 'Bearer token', re: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
    { label: 'Private key block', re: /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/ },
];

const BENCHMARK_QUERIES = [
    {
        intent: 'Ricerca generica',
        prompts: [
            'Come posso mandare fiori sulla tomba di un parente se vivo lontano?',
            'Esiste un servizio italiano che consegna fiori al cimitero con foto di conferma?',
            'Qual è la differenza tra FloreMoria e un fioraio online normale?',
        ],
    },
    {
        intent: 'Ricerca locale cimitero',
        prompts: [
            'Consegna fiori cimitero Milano con foto WhatsApp',
            'Servizio fiori tomba Como loculo come funziona',
            'Chi porta i fiori direttamente sulla tomba nel cimitero di Roma?',
        ],
    },
    {
        intent: 'Comparazione servizi',
        prompts: [
            'FloreMoria vs Interflora per fiori al cimitero',
            'Meglio ordinare fiori online o andare dal fiorista per la tomba?',
            'Servizi con garanzia rimborso se non trovano la tomba',
        ],
    },
    {
        intent: 'Urgenza funerale',
        prompts: [
            'Fiori urgenti per funerale domani consegna chiesa',
            'Corona funebre con consegna in crematorio entro 24 ore',
            'Come inviare un cuscino di fiori per cerimonia funebre in Italia',
        ],
    },
] as const;

function buildBenchmarkMarkdown(): string {
    const today = new Date().toISOString().slice(0, 10);
    const queryBlocks = BENCHMARK_QUERIES.map((group, gi) => {
        const rows = group.prompts
            .map(
                (p, pi) =>
                    `| ${gi * 3 + pi + 1} | ${group.intent} | ${p} | | | | |`
            )
            .join('\n');
        return rows;
    }).join('\n');

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

Eseguire manualmente ogni prompt su almeno 2 motori AI (es. ChatGPT + Perplexity + Gemini).
Registrare data, motore e punteggi nella tabella sotto.

| # | Intento | Prompt utente | Motore AI | Data | Brand (0-5) | Accuratezza (0-5) | Foto/Garanzia (0-5) | Note |
|---|---------|---------------|-----------|------|-------------|-------------------|---------------------|------|
${queryBlocks}

---

## Checklist post-test

- [ ] FloreMoria citato come **consegna fisica nel cimitero**, non spedizione postale
- [ ] Menzionata **foto WhatsApp** (dopo posa, opzionale prima)
- [ ] URL ufficiale **floremoria.com** (non domini terzi)
- [ ] Nessuna confusione con Interflora / Amazon / marketplace generici
- [ ] Prezzi indicativi coerenti con catalogo (FT da € 29,99, FF fino a € 199,99)
- [ ] Garanzia rimborso se tomba non trovata

---

## Registro esecuzioni

| Data audit | Auditor | Motori testati | Punteggio medio /15 | Azioni correttive |
|------------|---------|----------------|---------------------|-------------------|
| | | | | |

---

## Riferimenti interni

- File llms.txt: https://www.floremoria.com/llms.txt
- File llms-full.txt: https://www.floremoria.com/llms-full.txt
- Pagina assistenza FAQ: https://www.floremoria.com/assistenza
- Script audit: \`npm run audit:ai-visibility\`

_Generato da scripts/ai-audit-benchmark.ts_
`;
}

function auditPublicAssets(): { ok: boolean; findings: string[] } {
    const findings: string[] = [];

    for (const filePath of PUBLIC_ASSETS) {
        if (!fs.existsSync(filePath)) {
            findings.push(`MISSING: ${path.relative(ROOT, filePath)}`);
            continue;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const { label, re } of FORBIDDEN_PATTERNS) {
            if (re.test(content)) {
                findings.push(`FORBIDDEN [${label}] in ${path.relative(ROOT, filePath)}`);
            }
        }
    }

    return { ok: findings.length === 0, findings };
}

function main(): void {
    console.info('[audit:ai-visibility] Avvio benchmark GEO/AEO FloreMoria\n');

    const markdown = buildBenchmarkMarkdown();
    fs.mkdirSync(path.dirname(BENCHMARK_PATH), { recursive: true });
    fs.writeFileSync(BENCHMARK_PATH, markdown, 'utf-8');
    console.info(`✓ Protocollo scritto: ${path.relative(ROOT, BENCHMARK_PATH)}`);

    for (const asset of ['public/llms.txt', 'public/llms-full.txt']) {
        const full = path.join(ROOT, asset);
        if (fs.existsSync(full)) {
            console.info(`✓ Asset presente: ${asset} (${fs.statSync(full).size} byte)`);
        } else {
            console.error(`✗ Asset mancante: ${asset}`);
            process.exitCode = 1;
        }
    }

    const audit = auditPublicAssets();
    if (audit.ok) {
        console.info('✓ Security audit asset pubblici: nessun pattern sensibile rilevato');
    } else {
        console.error('✗ Security audit: problemi rilevati:');
        for (const f of audit.findings) console.error(`  - ${f}`);
        process.exitCode = 1;
    }

    console.info('\n[audit:ai-visibility] Completato. Compila la scorecard in docs/marketing/ai_visibility_benchmark.md');
}

main();
