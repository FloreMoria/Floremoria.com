import { TaxDeadline } from './types';

/** Avvio scadenziario attivo Contabilità (dopo archivio Q2). */
const OPERATIONAL_START = '2026-07-01';

/** Parsa YYYY-MM-DD come mezzanotte locale (evita offset UTC che sposta il giorno). */
function parseLocalDate(isoDate: string): Date {
    const m = String(isoDate).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
        const d = new Date(isoDate);
        d.setHours(0, 0, 0, 0);
        return d;
    }
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

/**
 * Genera l'elenco degli adempimenti fiscali e societari per FloreMoria S.r.l.
 * Elenco attivo da 01/07/2026 (mesi precedenti considerati archiviati).
 */
export function getUpcomingDeadlines(
    completedIds: string[] = [],
    statusOverrides: Record<string, string> = {}
): TaxDeadline[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentYear = today.getFullYear();
    const deadlines: TaxDeadline[] = [];

    const addDeadline = (
        id: string,
        title: string,
        category: TaxDeadline['category'],
        dueDateStr: string,
        frequency: TaxDeadline['frequency'],
        description: string,
        externalRef?: string
    ) => {
        // Scarta adempimenti precedenti al 1° luglio 2026 (già archiviati)
        if (dueDateStr < OPERATIONAL_START) return;

        const dueDate = parseLocalDate(dueDateStr);
        const diffTime = dueDate.getTime() - today.getTime();
        const daysRemaining = Math.round(diffTime / (1000 * 60 * 60 * 24));

        const isCompleted = completedIds.includes(id);
        const override = (statusOverrides[id] || '').toUpperCase();

        let status: TaxDeadline['status'] = 'PENDING';
        let isUrgent = false;
        let uiStatus: TaxDeadline['uiStatus'] = 'PENDING';

        if (override === 'ARCHIVED') {
            uiStatus = 'ARCHIVED';
            status = 'COMPLETED';
        } else if (override === 'PAID' || isCompleted) {
            uiStatus = 'PAID';
            status = 'COMPLETED';
        } else if (daysRemaining < 0) {
            // Insoluto / scaduto: resta in evidenza (anche oltre 90 giorni)
            uiStatus = 'SCADUTO';
            status = 'URGENT';
            isUrgent = true;
        } else if (daysRemaining >= 0 && daysRemaining <= 10) {
            status = 'URGENT';
            isUrgent = true;
            uiStatus = 'DUE_SOON';
        } else if (override === 'PENDING' || !override) {
            uiStatus = 'PENDING';
        }

        deadlines.push({
            id,
            title,
            category,
            dueDate: dueDateStr,
            frequency,
            description,
            status,
            uiStatus,
            isUrgent,
            daysRemaining,
            externalRef,
        });
    };

    // --- Contenuto scadenze (riuso della logica esistente sotto) ---
    // Delegato: ricostruiamo chiamando le stesse addDeadline del file originale.
    // Per mantenere le scadenze senza duplicare 200 righe, importiamo il corpo da un helper interno.

    fillDeadlinesForYear(addDeadline, currentYear);
    if (today.getMonth() >= 10) {
        // Fine anno: mostra anche scadenze dell'anno successivo utili in anticipo
        fillDeadlinesForYear(addDeadline, currentYear + 1);
    }

    return deadlines
        .filter((d) => d.dueDate >= OPERATIONAL_START)
        .sort((a, b) => {
            // SCADUTO prima, poi per data
            const aOver = a.uiStatus === 'SCADUTO' ? 0 : 1;
            const bOver = b.uiStatus === 'SCADUTO' ? 0 : 1;
            if (aOver !== bOver) return aOver - bOver;
            return a.dueDate.localeCompare(b.dueDate);
        });
}

type AddFn = (
    id: string,
    title: string,
    category: TaxDeadline['category'],
    dueDateStr: string,
    frequency: TaxDeadline['frequency'],
    description: string,
    externalRef?: string
) => void;

function fillDeadlinesForYear(addDeadline: AddFn, currentYear: number) {
    // 1. LIQUIDAZIONE IVA TRIMESTRALE
    const ivaQuarters: Array<{ q: number; due: string }> = [
        { q: 1, due: `${currentYear}-05-16` },
        { q: 2, due: `${currentYear}-08-20` },
        { q: 3, due: `${currentYear}-11-16` },
        { q: 4, due: `${currentYear + 1}-03-16` },
    ];
    for (const { q, due } of ivaQuarters) {
        addDeadline(
            `iva_liq_q${q}_${currentYear}`,
            `Liquidazione IVA Trimestrale T${q}`,
            'IVA',
            due,
            'QUARTERLY',
            `Calcolo e versamento dell&apos;IVA a debito relativa al ${q}° trimestre ${currentYear} (codice tributo 6031–6034) tramite modello F24.`
        );
    }

    // 2. ESTEROMETRO / LIPE
    addDeadline(
        `lipe_q1_${currentYear}`,
        'Comunicazione LIPE T1',
        'ESTEROMETRO',
        `${currentYear}-05-31`,
        'QUARTERLY',
        'Invio telematico della Comunicazione delle liquidazioni periodiche IVA (LIPE) relativa al 1° trimestre.'
    );
    addDeadline(
        `lipe_q2_${currentYear}`,
        'Comunicazione LIPE T2',
        'ESTEROMETRO',
        `${currentYear}-09-30`,
        'QUARTERLY',
        'Invio telematico della Comunicazione delle liquidazioni periodiche IVA (LIPE) relativa al 2° trimestre.'
    );
    addDeadline(
        `lipe_q3_${currentYear}`,
        'Comunicazione LIPE T3',
        'ESTEROMETRO',
        `${currentYear}-11-30`,
        'QUARTERLY',
        'Invio telematico della Comunicazione delle liquidazioni periodiche IVA (LIPE) relativa al 3° trimestre.'
    );
    addDeadline(
        `lipe_q4_${currentYear}`,
        'Comunicazione LIPE T4',
        'ESTEROMETRO',
        `${currentYear + 1}-02-28`,
        'QUARTERLY',
        'Invio telematico della Comunicazione delle liquidazioni periodiche IVA (LIPE) relativa al 4° trimestre.'
    );

    // 3. F24 RITENUTE / CONTRIBUTI
    for (const month of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        const dueDay = 16;
        const mm = String(month).padStart(2, '0');
        addDeadline(
            `f24_ritenute_${currentYear}_${mm}`,
            `F24 Ritenute / contributi — ${mm}/${currentYear}`,
            'F24',
            `${currentYear}-${mm}-${String(dueDay).padStart(2, '0')}`,
            'MONTHLY',
            'Versamento ritenute operate e contributi previdenziali del mese precedente tramite modello F24.'
        );
    }

    // 4. BILANCIO
    addDeadline(
        `bilancio_approvazione_${currentYear}`,
        'Approvazione bilancio d&apos;esercizio',
        'BILANCIO',
        `${currentYear}-04-30`,
        'ANNUAL',
        'Convocazione dell&apos;assemblea dei soci per la discussione e l&apos;approvazione del bilancio d&apos;esercizio FloreMoria relativo all&apos;anno precedente.'
    );
    addDeadline(
        `bilancio_deposito_${currentYear}`,
        'Deposito bilancio Registro Imprese',
        'BILANCIO',
        `${currentYear}-05-30`,
        'ANNUAL',
        'Invio telematico del bilancio approvato e dei relativi allegati al Registro delle Imprese presso la Camera di Commercio.'
    );

    // 5. STARTUP INNOVATIVA
    addDeadline(
        `startup_confirm_${currentYear}`,
        'Conferma requisiti Startup Innovativa',
        'STARTUP_INNOVATIVA',
        `${currentYear}-06-30`,
        'ANNUAL',
        'Aggiornamento della dichiarazione di conferma del possesso dei requisiti di Startup Innovativa presso il Registro Imprese.'
    );

    // 6. CONTABILITÀ
    addDeadline(
        `tenuta_registri_${currentYear}`,
        'Aggiornamento registri contabili',
        'CONTABILITA',
        `${currentYear}-12-31`,
        'ANNUAL',
        'Verifica e aggiornamento dei registri IVA, libro giornale e libro inventari per l&apos;esercizio in corso.'
    );

    // 7. ACCONTO IRES/IRAP
    addDeadline(
        `acconto_ires_irap_${currentYear}`,
        'Acconto IRES e IRAP (II / unica rata)',
        'F24',
        `${currentYear}-11-30`,
        'ANNUAL',
        'Versamento a mezzo modello F24 della seconda o unica rata di acconto per le imposte IRES e IRAP dell&apos;anno in corso.'
    );

    // 8. DICHIARATIVI
    addDeadline(
        `modello_redditi_${currentYear}`,
        'Presentazione Modello REDDITI SC e IRAP',
        'DICHIARATIVI',
        `${currentYear}-11-30`,
        'ANNUAL',
        'Presentazione in via telematica all&apos;Agenzia delle Entrate del modello REDDITI Società di Capitali e della dichiarazione IRAP.'
    );
    addDeadline(
        `modello_770_${currentYear}`,
        'Invio Modello 770',
        'DICHIARATIVI',
        `${currentYear}-11-30`,
        'ANNUAL',
        'Trasmissione telematica del modello 770 contenente i dati delle ritenute operate su compensi, dividendi e previdenza.'
    );
}
