import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Carica .env e .env.local (stesso pattern di insert-verbale-barbara-dashboard-home-maggio-2026.ts). */
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

const VERBALI: {
    prot: number;
    topic: string;
    shortSummary: string;
    keyPrompt: string;
    fullText: string;
    discussedPoints: string;
    achievedResults: string;
    pendingTasks: string;
}[] = [
    {
        prot: 165,
        topic: 'FLOREM_AUTO_PROT_165 — PDP segregazione FT/FF/PA e certificazione fotografica',
        shortSummary: 'Optional foto prima solo FT; testi certificazione per categoria; merge carrello foto solo con bouquet tombe.',
        keyPrompt: 'BARBARA / DEVIN — Verbale PDP catalogo',
        fullText: 'Verbale operativo 03/05/2026: allineamento PDP per categoria merceologica e supplemento fotografico tombe. Dettaglio in notes/obsidian/verbali/2026-05-03_FLOREM_AUTO_PROT_165.md',
        discussedPoints: 'Copy certificazione; optional foto; coerenza localStorage.',
        achievedResults: 'ProductClientView + floremPreDeliveryPhoto aggiornati.',
        pendingTasks: 'Verifica E2E su tre categorie in staging.',
    },
    {
        prot: 166,
        topic: 'FLOREM_AUTO_PROT_166 — Navbar active state da categoria prodotto (slug PDP)',
        shortSummary: 'Risoluzione evidenziazione errata «Fiori sulle tombe» su tutte le PDP: lookup slug → categoria.',
        keyPrompt: 'BARBARA / DEVIN / NINA — Navbar',
        fullText: 'Verbale 03/05/2026. File Obsidian: 2026-05-03_FLOREM_AUTO_PROT_166.md',
        discussedPoints: 'Path comune /fiori-sulle-tombe/[slug] vs categorie FF/FA.',
        achievedResults: 'isNavLinkActive + getProductBySlug.',
        pendingTasks: 'Nessuno.',
    },
    {
        prot: 167,
        topic: 'FLOREM_AUTO_PROT_167 — Layout optional FT (Completa il tuo omaggio)',
        shortSummary: 'Griglia densa; striscia foto full width; varianti ftDense / ftFotoStrip.',
        keyPrompt: 'BARBARA / NINA / ARLO — UX PDP',
        fullText: 'Verbale 03/05/2026. File Obsidian: 2026-05-03_FLOREM_AUTO_PROT_167.md',
        discussedPoints: 'Spazio vuoto card optional.',
        achievedResults: 'Refactor renderAddonCard.',
        pendingTasks: 'Feedback utente reale.',
    },
    {
        prot: 168,
        topic: 'FLOREM_AUTO_PROT_168 — Spostamento «Serve Aiuto?» colonna sinistra PDP',
        shortSummary: 'Modulo WhatsApp spostato sotto consegna nella colonna gallery.',
        keyPrompt: 'BARBARA / NINA',
        fullText: 'Verbale 03/05/2026. File Obsidian: 2026-05-03_FLOREM_AUTO_PROT_168.md',
        discussedPoints: 'Bilanciamento trust SX/DX.',
        achievedResults: 'Blocco unificato SX.',
        pendingTasks: 'Nessuno.',
    },
    {
        prot: 169,
        topic: 'FLOREM_AUTO_PROT_169 — Checkout FF/FA/FT: step opzioni e abbonamento solo tombe',
        shortSummary: 'FF promemoria tomba; PA skip step; FT abbonamento; progress bar 2/3 passi.',
        keyPrompt: 'BARBARA / DEVIN / ALMA / NINA — Checkout',
        fullText: 'Verbale 03/05/2026. File Obsidian: 2026-05-03_FLOREM_AUTO_PROT_169.md',
        discussedPoints: 'Attrito emotivo; fm_sub solo FT.',
        achievedResults: 'goCheckoutNext/Prev; useEffect categorie.',
        pendingTasks: 'Worker T+10 giorni POSTMAN.',
    },
    {
        prot: 170,
        topic: 'FLOREM_AUTO_PROT_170 — Copy pagamento Stripe/WhatsApp e mono-categoria carrello',
        shortSummary: 'Messaggio unificato step 3; regola carrello; modale Quiet Luxury.',
        keyPrompt: 'BARBARA / DEVIN',
        fullText: 'Verbale 03/05/2026. File Obsidian: 2026-05-03_FLOREM_AUTO_PROT_170.md',
        discussedPoints: 'Trasparenza pagamento; mix categorie vietato.',
        achievedResults: 'FloremCartCategoryModal; floremCartCategory.',
        pendingTasks: 'Nessuno.',
    },
    {
        prot: 171,
        topic: 'FLOREM_AUTO_PROT_171 — API checkout: isRecurring solo FT; validazione carrello misto',
        shortSummary: 'Server-side 400 su carrello misto; coerenza orderCategory vs catalogo.',
        keyPrompt: 'BARBARA / DEVIN — API',
        fullText: 'Verbale 03/05/2026. File Obsidian: 2026-05-03_FLOREM_AUTO_PROT_171.md',
        discussedPoints: 'Integrità ordine.',
        achievedResults: 'route.ts aggiornato.',
        pendingTasks: 'Monitor log errori 400.',
    },
    {
        prot: 172,
        topic: 'FLOREM_AUTO_PROT_172 — Pagina Carrello: blocco checkout se categorie miste',
        shortSummary: 'Alert rosso; canProceedCheckout.',
        keyPrompt: 'BARBARA / NINA',
        fullText: 'Verbale 03/05/2026. File Obsidian: 2026-05-03_FLOREM_AUTO_PROT_172.md',
        discussedPoints: 'Prevenzione prima del checkout.',
        achievedResults: 'getCartCatalogCategoryState in UI carrello.',
        pendingTasks: 'Nessuno.',
    },
    {
        prot: 173,
        topic: 'FLOREM_AUTO_PROT_173 — Libreria categoria carrello e sostituzione confirm nativi',
        shortSummary: 'floremCartCategory.ts; modale condivisa su PDP, preview, checkout.',
        keyPrompt: 'BARBARA / DEVIN / NINA / ARLO',
        fullText: 'Verbale 03/05/2026. File Obsidian: 2026-05-03_FLOREM_AUTO_PROT_173.md',
        discussedPoints: 'UX coerente; nessuna eccezione FT+FA.',
        achievedResults: 'Componente FloremCartCategoryModal.',
        pendingTasks: 'Test accessibilità focus trap (opzionale).',
    },
    {
        prot: 174,
        topic: 'FLOREM_AUTO_PROT_174 — Chiusura sessione: archiviazione verbali Dashboard/Obsidian',
        shortSummary: 'Export MD notes/obsidian/verbali/; script Prisma; orderBy log id desc.',
        keyPrompt: 'BARBARA / DEVIN — Archiviazione',
        fullText: 'Verbale 03/05/2026. File Obsidian: 2026-05-03_FLOREM_AUTO_PROT_174.md',
        discussedPoints: 'Tracciabilità staff; commit repository.',
        achievedResults: 'Pacchetto PROT_165–174 registrato.',
        pendingTasks: 'Eseguire questo script con DB attivo per popolamento floremoria_logs.',
    },
];

async function main(): Promise<void> {
    loadEnvFiles();
    if (!process.env.DATABASE_URL?.trim()) {
        console.error('Manca DATABASE_URL: impossibile inserire i log in floremoria_logs. I file Markdown in notes/obsidian/verbali/ restano comunque la fonte archivistica.');
        process.exit(1);
    }

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
        for (const v of VERBALI) {
            await prisma.floremoriaLog.create({
                data: {
                    sessionDate: SESSION_DAY,
                    tag: `#BARBARA_PROT_${v.prot}`,
                    topic: v.topic,
                    shortSummary: v.shortSummary,
                    keyPrompt: v.keyPrompt,
                    fullText: v.fullText,
                    discussedPoints: v.discussedPoints,
                    achievedResults: v.achievedResults,
                    pendingTasks: v.pendingTasks,
                    criticalAlarms: null,
                },
            });
            console.log(`Inserito FLOREM_AUTO_PROT_${v.prot}`);
        }
    } finally {
        await prisma.$disconnect();
    }

    console.log('Completato: 10 verbali in floremoria_logs (ordinamento consigliato: sessionDate desc, id desc).');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
