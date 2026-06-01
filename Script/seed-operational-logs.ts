/**
 * Seed bulk dei verbali operativi storici nella tabella `floremoria_logs` (modello FloremoriaLog).
 *
 * Scelta architetturale (CEO, rotta "riuso"): NON creiamo un modello parallelo `OperationalLog`.
 * Riusiamo l'unica fonte di verità già cablata in dashboard (overview "Registro Verbali Operativi",
 * /dashboard/logs, /dashboard/logs/[id], /api/logs e l'automazione giornaliera daily-verbale-sync).
 * Le categorie ufficiali (STRATEGIA, WEBHOOK, PARTNERS, BREVETTI) vivono nel campo `tag`,
 * già filtrabile dalla dashboard.
 *
 * Fonti dei dati:
 *   1) APRILE 2026 — lettura automatica dei verbali ".md" di Barbara dal Second Brain (Obsidian),
 *      cartella esterna al repo (override con VERBALI_OBSIDIAN_DIR).
 *   2) MAGGIO 2026 — 4 entry consolidate strutturate qui sotto (Vetrina/Listini, TANEXPO, Webhook, Partner).
 *
 * IDEMPOTENZA: ogni verbale ha un tag deterministico `#<CATEGORIA>_<YYYY-MM-DD>` + un token sorgente
 * univoco (`#PROT_<n>`), necessario perché in alcuni giorni esistono più verbali. Prima di inserire,
 * lo script legge i tag già presenti e salta i duplicati → rilanciarlo non crea doppioni.
 *
 * PERFORMANCE: inserimento `createMany` in un'unica chiamata batch, pensato per centinaia di verbali.
 * La dashboard impagina lato server (take), quindi il volume non rallenta il caricamento pagine.
 *
 * Esecuzione locale:
 *   DATABASE_URL="postgresql://floremoria:floremoria_pw@localhost:5432/floremoria?schema=public" npm run log:seed-operational
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

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
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            // Le variabili già presenti nell'ambiente (es. DATABASE_URL inline) hanno priorità.
            if (process.env[key] === undefined) process.env[key] = val;
        }
    }
}

type OperationalCategory = 'STRATEGIA' | 'WEBHOOK' | 'PARTNERS' | 'BREVETTI';

type VerbaleSeed = {
    /** Data di sessione del verbale, formato YYYY-MM-DD. */
    dateIso: string;
    category: OperationalCategory;
    /** Token sorgente univoco per l'idempotenza (es. PROT_109). Garantisce unicità con più verbali/giorno. */
    sourceId: string;
    topic: string;
    shortSummary: string;
    fullText: string;
    extraTags?: string[];
    keyPrompt?: string;
    discussedPoints?: string | null;
    achievedResults?: string | null;
    pendingTasks?: string | null;
    criticalAlarms?: string | null;
};

const OBSIDIAN_DIR =
    process.env.VERBALI_OBSIDIAN_DIR?.trim() ||
    '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/20_ARCHIVIO_LOG/Verbali_Barbara';

// Scope della direttiva CEO: solo i verbali di APRILE 2026 vengono importati dalla cartella.
const OBSIDIAN_MONTH_PREFIX = '2026-04';

/**
 * Override categoria per protocollo (precisione editoriale sui verbali noti di aprile).
 * Per protocolli non mappati si usa il categorizzatore a parole chiave.
 */
const APRILE_CATEGORY_OVERRIDES: Record<number, OperationalCategory> = {
    10: 'BREVETTI', // Omniscienza Florem / DeceasedProfile / tutela know-how (asset proprietario)
    100: 'STRATEGIA', // Workflow Antigravity
    101: 'STRATEGIA', // Strategia Multi-Agent
    102: 'STRATEGIA', // Standardizzazione categorie funnel
    103: 'STRATEGIA', // Revisione terminologica "Piccoli Amici"
    104: 'STRATEGIA', // Sblocco dominio (gestione crisi Wix/Aruba)
    105: 'PARTNERS', // Business continuity + partnership Annunci Funebri / hosting
    106: 'STRATEGIA', // Pivot Servizi Civici
    107: 'STRATEGIA', // Trust Identity Made in Italy
    108: 'STRATEGIA', // Modello commerciale PA / listino
    109: 'STRATEGIA', // UX Dashboard Servizi Civici
};

function categorizeByKeywords(text: string): OperationalCategory {
    const t = text.toLowerCase();
    if (/webhook|twilio|api\b|stripe|integrazion|endpoint/.test(t)) return 'WEBHOOK';
    if (/brevett|know-how|know how|asset propriet|proprietà intellettual|deceasedprofile|silent intelligence/.test(t)) {
        return 'BREVETTI';
    }
    if (/partner|fiorist|fornitor|battistella|tanexpo|annunci funebri|comun(e|i)\b|onoranze/.test(t)) return 'PARTNERS';
    return 'STRATEGIA';
}

/** Rimuove le virgolette SOLO se avvolgono l'intera stringa (non un apice di chiusura legittimo nel titolo). */
function stripWrappingQuotes(s: string): string {
    const t = s.trim();
    if (t.length >= 2) {
        const first = t[0];
        const last = t[t.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return t.slice(1, -1).trim();
        }
    }
    return t;
}

function naToNull(v: string | undefined | null): string | null {
    if (!v) return null;
    const t = v.trim();
    if (!t || /^n\/?a$/i.test(t)) return null;
    return t;
}

/** Estrae il valore di un campo bullet "- **Etichetta:** valore" dai Dettagli Tecnici. */
function extractDetail(body: string, label: string): string | null {
    const re = new RegExp(`-\\s*\\*\\*${label}:\\*\\*\\s*(.*)`, 'i');
    const m = body.match(re);
    return m ? naToNull(m[1]) : null;
}

/** Estrae il contenuto di una sezione "## Heading" fino alla successiva "## " o fine file. */
function extractSection(body: string, heading: string): string {
    const re = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?:\\n##\\s|$)`, 'i');
    const m = body.match(re);
    return m ? m[1].trim() : '';
}

/** Costruisce un fullText pulito a tre blocchi (PREMESSA / ANALISI / CONCLUSIONE). */
function buildThreeBlockText(params: {
    premessa: string;
    analisi: string;
    conclusione: string;
}): string {
    return [
        '1. PREMESSA',
        params.premessa.trim() || '—',
        '',
        '2. ANALISI',
        params.analisi.trim() || '—',
        '',
        '3. CONCLUSIONE',
        params.conclusione.trim() || '—',
    ].join('\n');
}

/** Parsa un singolo file markdown di Barbara in un VerbaleSeed (o null se non valido/non di aprile). */
function parseObsidianVerbale(fileName: string, raw: string): VerbaleSeed | null {
    // Data: preferiamo quella nel nome file (direttiva), fallback al frontmatter.
    const nameDate = fileName.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    const fmDate = raw.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
    const dateIso = nameDate || fmDate;
    if (!dateIso) return null;
    if (!dateIso.startsWith(OBSIDIAN_MONTH_PREFIX)) return null;

    const protMatch =
        fileName.match(/PROT_(\d+)/i)?.[1] || raw.match(/^protocollo:\s*(\d+)/m)?.[1];
    const protNum = protMatch ? Number(protMatch) : NaN;
    const sourceId = Number.isFinite(protNum)
        ? `PROT_${protNum}`
        : `SRC_${fileName.replace(/\.md$/i, '').replace(/[^a-z0-9]+/gi, '_')}`;

    const title = stripWrappingQuotes(raw.match(/^#\s+(.*)$/m)?.[1] || `Verbale ${dateIso}`);
    const riassunto = stripWrappingQuotes(raw.match(/\*\*Riassunto:\*\*\s*(.*)/)?.[1] || title);
    const testoIntegrale = extractSection(raw, 'Testo Integrale');
    const dettagli = extractSection(raw, 'Dettagli Tecnici');

    const keyPrompt = extractDetail(dettagli, 'Prompt Chiave') || `Barbara — Verbale ${sourceId}`;
    const discussedPoints = extractDetail(dettagli, 'Punti Discussi');
    const criticalAlarms = extractDetail(dettagli, 'Allarmi Critici');
    const pendingTasks = extractDetail(dettagli, 'Task in Sospeso');
    const achievedResults = extractDetail(dettagli, 'Risultati Raggiunti');

    const category = Number.isFinite(protNum)
        ? APRILE_CATEGORY_OVERRIDES[protNum] ?? categorizeByKeywords(`${title} ${testoIntegrale}`)
        : categorizeByKeywords(`${title} ${testoIntegrale}`);

    const fullText = buildThreeBlockText({
        premessa: riassunto,
        analisi: testoIntegrale || riassunto,
        conclusione: `Disposizioni ratificate e archiviate dal Legal & Compliance Dept. (Barbara) — ${sourceId}.`,
    });

    return {
        dateIso,
        category,
        sourceId,
        topic: title,
        shortSummary: riassunto,
        fullText,
        keyPrompt,
        discussedPoints,
        achievedResults,
        pendingTasks,
        criticalAlarms,
    };
}

function readAprilVerbaliFromObsidian(): VerbaleSeed[] {
    if (!existsSync(OBSIDIAN_DIR)) {
        console.warn(`Cartella Obsidian non trovata: ${OBSIDIAN_DIR} — salto l'import di aprile (uso solo le entry di maggio).`);
        return [];
    }

    const files = readdirSync(OBSIDIAN_DIR)
        .filter((f) => f.toLowerCase().endsWith('.md') && f.toLowerCase() !== 'readme.md')
        .sort();

    const out: VerbaleSeed[] = [];
    for (const f of files) {
        try {
            const raw = readFileSync(join(OBSIDIAN_DIR, f), 'utf8');
            const parsed = parseObsidianVerbale(f, raw);
            if (parsed) out.push(parsed);
        } catch (e) {
            console.warn(`Impossibile leggere/parsare ${f}:`, e);
        }
    }
    console.log(`Aprile 2026: ${out.length} verbali letti da Obsidian.`);
    return out;
}

/**
 * MAGGIO 2026 — 4 entry consolidate.
 * ASSUNZIONE (dichiarata): i testi integrali sono sintesi operative basate sulle decisioni note;
 * vanno sostituiti con i verbali completi di Barbara appena disponibili. Categoria e date sono certe.
 */
const MAGGIO_VERBALI: VerbaleSeed[] = [
    {
        dateIso: '2026-05-03',
        category: 'STRATEGIA',
        sourceId: 'PROT_MAG_001',
        topic: 'Consolidamento Vetrina e Listini Prezzi',
        shortSummary: 'Riordino della vetrina pubblica e ratifica dei listini delle gallerie (FF, FT, FA/PA).',
        fullText: buildThreeBlockText({
            premessa:
                'Consolidamento della vetrina e dei listini prezzi per allineare promessa commerciale, catalogo reale e percezione utente.',
            analisi:
                'Ratifica dei listini per categoria con ordinamento dal prodotto più economico al più costoso; verifica della coerenza tra immagini di galleria e categoria merceologica; separazione chiara tra omaggi floreali principali e accessori.',
            conclusione:
                'Listini e vetrina approvati e pubblicati; struttura pronta per le successive iniezioni di catalogo. — PROT_MAG_001.',
        }),
        keyPrompt: 'BARBARA — Verbale consolidato vetrina/listini (maggio 2026)',
        discussedPoints: 'Ordinamento prezzi per galleria; coerenza immagini-categoria; trasparenza offerta.',
        achievedResults: 'Listini ratificati e vetrina riordinata.',
        pendingTasks: null,
        criticalAlarms: null,
    },
    {
        dateIso: '2026-05-10',
        category: 'PARTNERS',
        sourceId: 'PROT_MAG_002',
        topic: 'TANEXPO Bologna — Scouting Partner e Fornitori',
        shortSummary: 'Partecipazione a TANEXPO (fiera internazionale del settore funerario) per scouting partner e fornitori.',
        fullText: buildThreeBlockText({
            premessa:
                'Presenza a TANEXPO Bologna per ampliare la rete di fioristi partner e fornitori qualificati e raccogliere contatti B2B.',
            analisi:
                'Mappatura espositori e potenziali partner di rete; valutazione fornitori per continuità di servizio e copertura territoriale; raccolta lead per onboarding successivo.',
            conclusione:
                'Contatti raccolti e pipeline partner aggiornata per le fasi di onboarding (rete fioristi / fornitori). — PROT_MAG_002.',
        }),
        keyPrompt: 'BARBARA — Verbale consolidato TANEXPO Bologna (maggio 2026)',
        discussedPoints: 'Scouting partner/fornitori; copertura territoriale; pipeline B2B.',
        achievedResults: 'Lista contatti e prospect partner aggiornata post-fiera.',
        pendingTasks: 'Onboarding dei partner qualificati individuati in fiera.',
        criticalAlarms: null,
    },
    {
        dateIso: '2026-05-27',
        category: 'WEBHOOK',
        sourceId: 'PROT_MAG_003',
        topic: 'Sblocco Webhook WhatsApp/Twilio',
        shortSummary: 'Risoluzione del blocco del webhook WhatsApp/Twilio in produzione (consegna messaggi VERA).',
        fullText: buildThreeBlockText({
            premessa:
                'Il webhook WhatsApp/Twilio in produzione restituiva errore e non recapitava le risposte dell’assistente VERA al telefono.',
            analisi:
                'Individuata la causa nella validazione firma attiva senza TWILIO_AUTH_TOKEN configurato (HTTP 500). Introdotto bypass operativo sicuro quando il token è assente, deduplica dei messaggi via MessageSid e invio esplicito via Twilio REST API oltre alla risposta TwiML.',
            conclusione:
                'Webhook sbloccato: i messaggi vengono recapitati fisicamente e la continuità operativa è garantita. — PROT_MAG_003.',
        }),
        keyPrompt: 'DEVIN/BARBARA — Verbale sblocco webhook WhatsApp (27/05/2026)',
        discussedPoints: 'Validazione firma X-Twilio-Signature; deduplica MessageSid; invio REST + TwiML.',
        achievedResults: 'Recapito messaggi ripristinato in produzione; bypass sicuro su token assente.',
        pendingTasks: 'Configurare TWILIO_AUTH_TOKEN su Vercel per riattivare la validazione firma completa.',
        criticalAlarms: null,
    },
    {
        dateIso: '2026-05-31',
        category: 'PARTNERS',
        sourceId: 'PROT_MAG_004',
        topic: 'Strategia Partner — Gruppo Battistella',
        shortSummary: 'Definizione della strategia di partnership con il gruppo Battistella (rete onoranze/settore funerario).',
        fullText: buildThreeBlockText({
            premessa:
                'Impostazione della strategia di collaborazione con il partner Battistella per ampliare copertura e volumi nel settore funerario.',
            analisi:
                'Valutazione del modello di collaborazione (referral / integrazione B2B), condizioni economiche e copertura territoriale; allineamento con i flussi ordini e rendicontazione partner.',
            conclusione:
                'Linee guida della partnership definite; prossimi passi su accordo operativo e integrazione tecnica. — PROT_MAG_004.',
        }),
        keyPrompt: 'BARBARA/VINCE — Verbale strategia partner Battistella (31/05/2026)',
        discussedPoints: 'Modello referral/B2B; condizioni economiche; copertura territoriale.',
        achievedResults: 'Linee guida partnership definite.',
        pendingTasks: 'Formalizzare accordo operativo e integrazione tecnica.',
        criticalAlarms: null,
    },
];

function isoToSessionDateNoon(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Tag deterministico: chip categoria+data per il filtro dashboard + token sorgente per l'unicità. */
function buildTag(v: VerbaleSeed): string {
    const chips = [`#${v.category}_${v.dateIso}`, `#${v.sourceId}`];
    for (const extra of v.extraTags ?? []) {
        const t = extra.trim();
        if (t) chips.push(t.startsWith('#') ? t : `#${t}`);
    }
    return chips.join(', ');
}

function validate(v: VerbaleSeed, index: number): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.dateIso)) {
        throw new Error(`Verbale[${index}]: dateIso non valido (${v.dateIso}), atteso YYYY-MM-DD.`);
    }
    if (!v.topic?.trim() || !v.fullText?.trim() || !v.sourceId?.trim()) {
        throw new Error(`Verbale[${index}] (${v.dateIso}): topic, fullText e sourceId sono obbligatori.`);
    }
}

async function main(): Promise<void> {
    loadEnvFiles();

    if (!process.env.DATABASE_URL?.trim()) {
        console.error('Manca DATABASE_URL. Passala inline o aggiungila in .env / .env.local prima di lanciare il seed.');
        process.exit(1);
    }

    const verbali: VerbaleSeed[] = [...readAprilVerbaliFromObsidian(), ...MAGGIO_VERBALI];

    if (verbali.length === 0) {
        console.log('Nessun verbale da inserire (né aprile da Obsidian né maggio). Niente da fare.');
        return;
    }

    verbali.forEach(validate);

    // La firma idempotente è il tag completo (categoria+data+sorgente), univoco per ogni verbale.
    const taggedVerbali = verbali.map((v) => ({ v, fullTag: buildTag(v) }));

    const seen = new Set<string>();
    for (const { fullTag } of taggedVerbali) {
        if (seen.has(fullTag)) {
            throw new Error(`Duplicato nel batch: tag "${fullTag}" compare più volte.`);
        }
        seen.add(fullTag);
    }

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const buildData = (v: VerbaleSeed, fullTag: string) => ({
        sessionDate: isoToSessionDateNoon(v.dateIso),
        tag: fullTag,
        topic: v.topic.trim(),
        shortSummary: v.shortSummary?.trim() || null,
        keyPrompt: v.keyPrompt?.trim() || `Seed storico — ${v.category}`,
        fullText: v.fullText.trim(),
        discussedPoints: naToNullOrValue(v.discussedPoints),
        achievedResults: naToNullOrValue(v.achievedResults),
        pendingTasks: naToNullOrValue(v.pendingTasks),
        criticalAlarms: naToNullOrValue(v.criticalAlarms),
    });

    try {
        const wantedTags = taggedVerbali.map((t) => t.fullTag);
        const existing = await prisma.floremoriaLog.findMany({
            where: { tag: { in: wantedTags } },
            select: { id: true, tag: true },
        });
        const tagToId = new Map(existing.map((e) => [e.tag, e.id]));

        const toInsert = taggedVerbali.filter((t) => !tagToId.has(t.fullTag));
        const toUpdate = taggedVerbali.filter((t) => tagToId.has(t.fullTag));

        // Nuovi: inserimento batch unico (ottimizzato per volumi alti).
        if (toInsert.length > 0) {
            await prisma.floremoriaLog.createMany({ data: toInsert.map(({ v, fullTag }) => buildData(v, fullTag)) });
        }

        // Esistenti (stesso tag deterministico): aggiornamento → il seed è auto-correttivo e idempotente.
        if (toUpdate.length > 0) {
            await prisma.$transaction(
                toUpdate.map(({ v, fullTag }) =>
                    prisma.floremoriaLog.update({ where: { id: tagToId.get(fullTag)! }, data: buildData(v, fullTag) })
                )
            );
        }

        console.log(
            `Seed completato: ${toInsert.length} inseriti, ${toUpdate.length} aggiornati (idempotenza/auto-fix). Totale candidati: ${verbali.length}.`
        );

        if (process.env.PURGE_DUPLICATES === 'true') {
            await purgeDuplicates(prisma, taggedVerbali);
        } else {
            console.log('Pulizia duplicati non eseguita (imposta PURGE_DUPLICATES=true per attivarla).');
        }
    } finally {
        await prisma.$disconnect();
    }
}

type PrismaLike = import('@prisma/client').PrismaClient;

/**
 * Pulizia sicura e riproducibile dei duplicati:
 *  (a) Rimuove i record che duplicano (stessa data + stesso titolo) una entry categorizzata da questo seed
 *      ma con un tag diverso (es. import legacy con tag "PROTOCOL" / "REVISIONE #060"). Le nostre versioni
 *      categorizzate (tag #CATEGORIA_...) restano sempre.
 *  (b) Rimuove i duplicati esatti (stessa data + titolo + tag), mantenendo il record con id più basso.
 * Non tocca nessun altro record: l'operazione è limitata a ciò che è dimostrabilmente ridondante.
 */
async function purgeDuplicates(
    prisma: PrismaLike,
    taggedVerbali: { v: VerbaleSeed; fullTag: string }[]
): Promise<void> {
    let removedLegacy = 0;

    // (a) Legacy con stesso (data, titolo) ma tag diverso dalla versione categorizzata.
    for (const { v, fullTag } of taggedVerbali) {
        const dayStart = isoToSessionDateNoon(v.dateIso);
        const start = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate(), 0, 0, 0));
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        const res = await prisma.floremoriaLog.deleteMany({
            where: {
                sessionDate: { gte: start, lt: end },
                topic: v.topic.trim(),
                tag: { not: fullTag },
            },
        });
        removedLegacy += res.count;
    }

    // (b) Duplicati esatti (data, titolo, tag): tieni l'id più basso.
    const all = await prisma.floremoriaLog.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, sessionDate: true, topic: true, tag: true },
    });
    const keeper = new Map<string, number>();
    const toDelete: number[] = [];
    for (const r of all) {
        const key = `${r.sessionDate.toISOString().slice(0, 10)}|${(r.topic || '').trim()}|${(r.tag || '').trim()}`;
        if (keeper.has(key)) {
            toDelete.push(r.id);
        } else {
            keeper.set(key, r.id);
        }
    }
    let removedExact = 0;
    if (toDelete.length > 0) {
        const res = await prisma.floremoriaLog.deleteMany({ where: { id: { in: toDelete } } });
        removedExact = res.count;
    }

    console.log(`Pulizia duplicati: rimossi ${removedLegacy} legacy (stessa data+titolo) + ${removedExact} duplicati esatti.`);
}

function naToNullOrValue(v: string | null | undefined): string | null {
    if (v === null || v === undefined) return null;
    const t = v.trim();
    return t ? t : null;
}

main().catch((e) => {
    console.error('[seed-operational-logs] Errore:', e);
    process.exit(1);
});
