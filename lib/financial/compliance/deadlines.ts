import { TaxDeadline } from './types';

/** Avvio contabilità operativa FloreMoria (Q2 2026). */
const OPERATIONAL_START = '2026-04-01';
/** Scadenze scadute da più di N giorni non devono mai comparire nello scadenziario. */
const MAX_OVERDUE_DAYS = 90;

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
 * Esclude sempre: pre-Q2 2026 e scadenze scadute da oltre 90 giorni.
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
        // Mai generare adempimenti precedenti all'avvio contabilità operativa
        if (dueDateStr < OPERATIONAL_START) return;

        const dueDate = parseLocalDate(dueDateStr);
        const diffTime = dueDate.getTime() - today.getTime();
        const daysRemaining = Math.round(diffTime / (1000 * 60 * 60 * 24));

        // Cancella dalla vista qualsiasi scadenza più vecchia di 90 giorni
        if (daysRemaining < -MAX_OVERDUE_DAYS) return;

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

    // 1. SCADENZE MENSILI: 16 di ogni mese (Versamento Ritenute d'Acconto e INPS F24)
    const mesiNomi = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];

    for (let m = 0; m < 12; m++) {
        const monthNum = String(m + 1).padStart(2, '0');
        const id = `f24_ritenute_${currentYear}_${monthNum}`;
        const title = `F24: Ritenute d'Acconto e INPS (${mesiNomi[m]})`;
        const dateStr = `${currentYear}-${monthNum}-16`;
        addDeadline(
            id,
            title,
            'F24',
            dateStr,
            'MONTHLY',
            `Versamento delle ritenute alla fonte operate sui compensi dei fioristi/collaboratori e dei contributi previdenziali INPS per il mese di ${mesiNomi[m]}.`
        );
    }

    // 1b. REPORT YOUDOOX FATTURE RICEVUTE — giorno 1 di ogni mese
    for (let m = 0; m < 12; m++) {
        const monthNum = String(m + 1).padStart(2, '0');
        const prevMonthIdx = m === 0 ? 11 : m - 1;
        const prevMonthLabel = mesiNomi[prevMonthIdx];
        addDeadline(
            `youdox_report_${currentYear}_${monthNum}`,
            `Scarica report Fatture Ricevute YouDoox (${mesiNomi[m]})`,
            'CONTABILITA',
            `${currentYear}-${monthNum}-01`,
            'MONTHLY',
            `Il giorno 1 di ${mesiNomi[m]} scarica da YouDoox il report fatture ricevute aggiornato (periodo fino a ${prevMonthLabel}) e caricalo in Contabilità (.xlsx/.csv o ZIP XML). I duplicati invariati vengono saltati; correzioni e note di credito aggiornano i record esistenti.`,
            'https://www.youdoox.com'
        );
    }
    // Anche gennaio anno successivo (visibilità a fine anno)
    addDeadline(
        `youdox_report_${currentYear + 1}_01`,
        `Scarica report Fatture Ricevute YouDoox (Gennaio)`,
        'CONTABILITA',
        `${currentYear + 1}-01-01`,
        'MONTHLY',
        `Il giorno 1 di Gennaio scarica da YouDoox il report fatture ricevute aggiornato e caricalo in Contabilità.`,
        'https://www.youdoox.com'
    );

    // 2. LIQUIDAZIONE IVA TRIMESTRALE (16 Maggio, 20 Agosto, 16 Novembre, 16 Febbraio)
    const ivaDeadlines = [
        { q: '1° Trimestre', date: `${currentYear}-05-16`, id: `iva_q1_${currentYear}` },
        { q: '2° Trimestre', date: `${currentYear}-08-20`, id: `iva_q2_${currentYear}` },
        { q: '3° Trimestre', date: `${currentYear}-11-16`, id: `iva_q3_${currentYear}` },
        { q: '4° Trimestre', date: `${currentYear + 1}-02-16`, id: `iva_q4_${currentYear}` }
    ];
    for (const item of ivaDeadlines) {
        addDeadline(
            item.id,
            `Liquidazione IVA Trimestrale - ${item.q}`,
            'IVA',
            item.date,
            'QUARTERLY',
            `Liquidazione e versamento dell'IVA a debito risultante dal calcolo del trimestre ${item.q} di FloreMoria S.r.l.`
        );
    }

    // 3. ESTEROMETRO / REVERSE CHARGE SAAS (Fine mese successivo al trimestre)
    // Es. Cursor/Meta/Claude SaaS acquistati all'estero
    const esterometroDeadlines = [
        { q: '1° Trimestre', date: `${currentYear}-04-30`, id: `estero_q1_${currentYear}` },
        { q: '2° Trimestre', date: `${currentYear}-07-31`, id: `estero_q2_${currentYear}` },
        { q: '3° Trimestre', date: `${currentYear}-10-31`, id: `estero_q3_${currentYear}` },
        { q: '4° Trimestre', date: `${currentYear + 1}-01-31`, id: `estero_q4_${currentYear}` }
    ];
    for (const item of esterometroDeadlines) {
        addDeadline(
            item.id,
            `Esterometro / Autofatture SaaS - ${item.q}`,
            'ESTEROMETRO',
            item.date,
            'QUARTERLY',
            `Trasmissione telematica dei dati relativi alle operazioni transfrontaliere (Reverse Charge su acquisti SaaS come Cursor, Google, Antigravity, Claude, Meta).`
        );
    }

    // 4. MODELLO INTRASTAT (25 del mese successivo al trimestre)
    const intrastatDeadlines = [
        { q: '1° Trimestre', date: `${currentYear}-04-25`, id: `intra_q1_${currentYear}` },
        { q: '2° Trimestre', date: `${currentYear}-07-25`, id: `intra_q2_${currentYear}` },
        { q: '3° Trimestre', date: `${currentYear}-10-25`, id: `intra_q3_${currentYear}` },
        { q: '4° Trimestre', date: `${currentYear + 1}-01-25`, id: `intra_q4_${currentYear}` }
    ];
    for (const item of intrastatDeadlines) {
        addDeadline(
            item.id,
            `Modello INTRASTAT - ${item.q}`,
            'ESTEROMETRO',
            item.date,
            'QUARTERLY',
            `Presentazione degli elenchi riepilogativi delle cessioni e degli acquisti intracomunitari di beni e servizi relativi al trimestre.`
        );
    }

    // 5. APPROVAZIONE E DEPOSITO BILANCIO D'ESERCIZIO (30 Aprile / 30 Giugno)
    addDeadline(
        `bilancio_approvazione_${currentYear}`,
        'Approvazione del Bilancio d&apos;Esercizio',
        'BILANCIO',
        `${currentYear}-04-30`,
        'ANNUAL',
        'Convocazione dell&apos;assemblea dei soci per la discussione e l&apos;approvazione del bilancio d&apos;esercizio FloreMoria relativo all&apos;anno precedente.'
    );
    addDeadline(
        `bilancio_deposito_${currentYear}`,
        'Deposito Bilancio d&apos;Esercizio in CamCom',
        'BILANCIO',
        `${currentYear}-06-30`,
        'ANNUAL',
        'Invio telematico del bilancio approvato e dei relativi allegati al Registro delle Imprese presso la Camera di Commercio.'
    );

    // 6. ADEMPIMENTI STARTUP INNOVATIVA (Entro 30 giorni da approvazione Bilancio)
    addDeadline(
        `startup_innovativa_requisiti_${currentYear}`,
        'Mantenimento Requisiti Startup Innovativa',
        'STARTUP_INNOVATIVA',
        `${currentYear}-07-30`,
        'ANNUAL',
        'Adempimento obbligatorio presso la Camera di Commercio per la dichiarazione di mantenimento dei requisiti di Startup Innovativa (investimenti R&D, personale qualificato, brevetti).'
    );

    // 7. ACCONTI E SALDI IRES/IRAP (30 Giugno / 30 Novembre)
    addDeadline(
        `ires_irap_saldo_acconto1_${currentYear}`,
        'Versamento Saldo e 1° Acconto IRES/IRAP',
        'F24',
        `${currentYear}-06-30`,
        'ANNUAL',
        'Versamento a mezzo modello F24 delle imposte IRES e IRAP a saldo dell&apos;anno precedente e primo acconto dell&apos;anno in corso.'
    );
    addDeadline(
        `ires_irap_acconto2_${currentYear}`,
        'Versamento 2° Acconto IRES/IRAP',
        'F24',
        `${currentYear}-11-30`,
        'ANNUAL',
        'Versamento a mezzo modello F24 della seconda o unica rata di acconto per le imposte IRES e IRAP dell&apos;anno in corso.'
    );

    // 8. DICHIARATIVI (30 Novembre)
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

    // Cintura di sicurezza: niente pre-Q2 né overdue > 90 giorni, anche se addDeadline cambia.
    return deadlines
        .filter(
            (d) =>
                d.dueDate >= OPERATIONAL_START && d.daysRemaining >= -MAX_OVERDUE_DAYS
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
