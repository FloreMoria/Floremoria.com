/**
 * Regola Aurea + automazione cloud (GitHub Actions):
 * - Calcola il giorno precedente nel fuso Europe/Rome.
 * - Assicura un file in notes/obsidian/verbali/ (Consolidato preferito, altrimenti Giornaliero + template se manca).
 * - Sincronizza un solo record in floremoria_logs (tag #BARBARA_VERBALE_GIORNO_YYYY-MM-DD).
 *
 * DATABASE_URL: opzionale in CI; se assente si aggiorna solo Obsidian in repo al prossimo commit manuale
 * (in Actions il commit è step separato). In locale: carica .env / .env.local.
 *
 * VERBALE_FORCE_ISO=YYYY-MM-DD (opzionale): forza la data di sessione (es. rettifica consolidato) invece di «ieri».
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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
            if (process.env[key] === undefined) {
                process.env[key] = val;
            }
        }
    }
}

/** Ieri a calendario in Europe/Rome → YYYY-MM-DD */
function getYesterdayRomeISO(): string {
    const tz = 'Europe/Rome';
    const todayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
    const [y, m, d] = todayStr.split('-').map(Number);
    const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    anchor.setUTCDate(anchor.getUTCDate() - 1);
    const yy = anchor.getUTCFullYear();
    const mm = String(anchor.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(anchor.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function sessionDateAtNoon(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function italianLongDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    const names = [
        'Gennaio',
        'Febbraio',
        'Marzo',
        'Aprile',
        'Maggio',
        'Giugno',
        'Luglio',
        'Agosto',
        'Settembre',
        'Ottobre',
        'Novembre',
        'Dicembre',
    ];
    return `${d} ${names[m - 1]} ${y}`;
}

const TEMPLATE = (iso: string, label: string) => `---
date: ${iso}
tipo: verbale_giornaliero_auto
tags: [verbale, BARBARA, DEVIN, FLOREM_NET, Regola_Aurea]
---

# Verbale Operativo FloreMoria — ${label}

**Redazione:** BARBARA / DEVIN (generazione automatica mattutina).  
**Giornata di riferimento (chiusura):** ${iso}.

> Scheda generata alle 08:00 (Europe/Rome) del giorno successivo. Completare le sezioni e consolidare se necessario rinominando in \`${iso}-Verbale-Consolidato.md\`.

## Sezione 1 — Infrastruttura

- (Da compilare)

## Sezione 2 — Strategia

- (Da compilare)

## Sezione 3 — Sviluppo

- (Da compilare)

## Sezione 4 — Logistica

- (Da compilare)
`;

function resolveSessionISO(): string {
    const raw = process.env.VERBALE_FORCE_ISO?.trim();
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return raw;
    }
    if (raw) {
        console.warn(`VERBALE_FORCE_ISO ignorato (formato non valido): ${raw}`);
    }
    return getYesterdayRomeISO();
}

async function main(): Promise<void> {
    const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
    if (!isCI) {
        loadEnvFiles();
    }

    const iso = resolveSessionISO();
    const forceIso = Boolean(process.env.VERBALE_FORCE_ISO?.trim());
    const verbaliDir = resolve(process.cwd(), 'notes/obsidian/verbali');
    if (!existsSync(verbaliDir)) {
        mkdirSync(verbaliDir, { recursive: true });
    }

    const pathConsolidato = resolve(verbaliDir, `${iso}-Verbale-Consolidato.md`);
    const pathGiornaliero = resolve(verbaliDir, `${iso}-Verbale-Giornaliero.md`);

    let sourcePath: string;
    let mdBody: string;
    let shortSummary: string;

    if (existsSync(pathConsolidato)) {
        sourcePath = pathConsolidato;
        mdBody = readFileSync(pathConsolidato, 'utf8');
        shortSummary = `Verbale consolidato archiviato (${iso}).`;
    } else if (existsSync(pathGiornaliero)) {
        sourcePath = pathGiornaliero;
        mdBody = readFileSync(pathGiornaliero, 'utf8');
        shortSummary = `Verbale giornaliero (${iso}).`;
    } else {
        if (forceIso) {
            console.error(
                `VERBALE_FORCE_ISO=${iso}: mancano sia ${pathConsolidato} sia ${pathGiornaliero}. Creare almeno uno dei due file.`
            );
            process.exit(1);
        }
        const label = italianLongDate(iso);
        mdBody = TEMPLATE(iso, label);
        writeFileSync(pathGiornaliero, mdBody, 'utf8');
        sourcePath = pathGiornaliero;
        shortSummary = `Scaffold verbale giornaliero (${iso}) — da completare in Obsidian.`;
        console.log(`Creato ${pathGiornaliero}`);
    }

    const rel = sourcePath.replace(process.cwd() + '/', '');
    const tag = `#BARBARA_VERBALE_GIORNO_${iso}`;
    const sessionDate = sessionDateAtNoon(iso);

    const dbUrl = process.env.DATABASE_URL?.trim();
    if (!dbUrl) {
        console.warn(
            'DATABASE_URL assente: skip floremoria_logs. Imposta il secret su GitHub Actions per la dashboard in cloud.'
        );
        console.log(`Obsidian/fonte: ${rel}`);
        return;
    }

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
        const legacyTag = `#BARBARA_VERBALE_CONSOLIDATO_${iso}`;
        const existing = await prisma.floremoriaLog.findFirst({
            where: {
                sessionDate,
                OR: [{ tag }, { tag: legacyTag }],
            },
            orderBy: { id: 'desc' },
        });

        const topic = `Verbale operativo ${italianLongDate(iso)} (Regola Aurea)`;
        const keyPrompt = forceIso
            ? 'BARBARA (Segreteria Senior) — deposito / rettifica consolidato e allineamento dashboard (coordinamento con referente di progetto Salvatore)'
            : 'BARBARA / DEVIN — Sync automatico mattutino (ieri, Europe/Rome)';
        const discussed = forceIso
            ? `Riscrittura integrale verbale ${iso} secondo standard redazionale FLOREM_NET; contenuto in Obsidian (${rel}).`
            : 'Vedi file Obsidian allegato; sezioni Infrastruttura, Strategia, Sviluppo, Logistica.';
        const achieved = forceIso
            ? `Aggiornamento record floremoria_logs da consolidato; sorgente: ${rel}`
            : `Sincronizzazione automatica su dashboard; fonte: ${rel}`;
        const pending = forceIso
            ? 'Verifica lettura su /dashboard/logs; eventuale push su main del file Obsidian.'
            : 'Completare il verbale in Obsidian e push su main se non già consolidato.';

        const data = {
            sessionDate,
            tag,
            topic,
            shortSummary,
            keyPrompt,
            fullText: `${mdBody.slice(0, 48000)}\n\n---\nSorgente: ${rel}`,
            discussedPoints: discussed,
            achievedResults: achieved,
            pendingTasks: pending,
            criticalAlarms: null as string | null,
        };

        if (existing) {
            await prisma.floremoriaLog.update({
                where: { id: existing.id },
                data: {
                    ...data,
                    tag,
                },
            });
            console.log(`Aggiornato log id=${existing.id} per ${iso}`);
        } else {
            await prisma.floremoriaLog.create({ data });
            console.log(`Inserito nuovo log per ${iso}`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
