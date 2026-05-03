import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFiles(): void {
    for (const name of ['.env', '.env.local']) {
        const p = resolve(process.cwd(), name);
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            const i = t.indexOf('=');
            if (i === -1) continue;
            const key = t.slice(0, i).trim();
            let val = t.slice(i + 1).trim();
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            process.env[key] = val;
        }
    }
}

const SESSION_DAY = new Date('2026-05-03T00:00:00.000Z');
const TAG_CONSOLIDATO = '#BARBARA_VERBALE_CONSOLIDATO_2026-05-03';
const TAGS_PROT_PARZIALI = Array.from({ length: 10 }, (_, i) => `#BARBARA_PROT_${165 + i}`);

const DISCUSSED = [
    'Sezione 1 — Infrastruttura: 22 agenti .cursorrules, backup, Next.js, tracciabilità log/Obsidian.',
    'Sezione 2 — Strategia: protocollo Vera-Human (VERA + trigger UMANO), coerenza brand.',
    'Sezione 3 — Sviluppo: Tre Porte home, PDP per categoria, checkout senza upsell abbonamento FF/PA, carrello mono-categoria.',
    'Sezione 4 — Logistica: roadmap Slack/WhatsApp per supporto fioristi, worker T+10.',
].join('\n');

const ACHIEVED = [
    'Verbale unico 2026-05-03-Verbale-Consolidato.md in notes/obsidian/verbali/.',
    'Rimozione record giornalieri parziali (#BARBARA_PROT_165–174) da floremoria_logs.',
    'Inserimento singolo record consolidato (Regola Aurea).',
].join('\n');

const PENDING = [
    'Integrazione Slack/WhatsApp per rete fioristi (fase POSTMAN/OSCAR).',
    'E2E staging su tre categorie catalogo; monitor 400 carrello misto.',
].join('\n');

const FULL_TEXT = `Verbale consolidato 03/05/2026 (Regola Aurea: un verbale per giornata).
Riferimento archivio: notes/obsidian/verbali/2026-05-03-Verbale-Consolidato.md
Tag: ${TAG_CONSOLIDATO}`;

async function main(): Promise<void> {
    loadEnvFiles();
    if (!process.env.DATABASE_URL?.trim()) {
        console.error(
            'Manca DATABASE_URL: impossibile aggiornare floremoria_logs. Il file Markdown consolidato resta la fonte in notes/obsidian/verbali/.'
        );
        process.exit(1);
    }

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
        const delProt = await prisma.floremoriaLog.deleteMany({
            where: {
                sessionDate: SESSION_DAY,
                tag: { in: TAGS_PROT_PARZIALI },
            },
        });
        console.log(`Rimossi ${delProt.count} verbali parziali (PROT_165–174).`);

        const delDup = await prisma.floremoriaLog.deleteMany({
            where: { sessionDate: SESSION_DAY, tag: TAG_CONSOLIDATO },
        });
        if (delDup.count > 0) {
            console.log(`Rimosso precedente consolidato duplicato (${delDup.count}).`);
        }

        await prisma.floremoriaLog.create({
            data: {
                sessionDate: SESSION_DAY,
                tag: TAG_CONSOLIDATO,
                topic:
                    'Verbale consolidato 03/05/2026 — FLOREM_NET (Regola Aurea: un verbale per giornata)',
                shortSummary:
                    'Infrastruttura 22 agenti e Next.js; strategia Vera-Human; sviluppo Tre Porte, checkout FF/PA, mono-categoria; logistica Slack/WhatsApp.',
                keyPrompt: 'BARBARA / DEVIN — Consolidamento giornaliero',
                fullText: FULL_TEXT,
                discussedPoints: DISCUSSED,
                achievedResults: ACHIEVED,
                pendingTasks: PENDING,
                criticalAlarms: null,
            },
        });
        console.log('Inserito verbale consolidato in floremoria_logs.');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
