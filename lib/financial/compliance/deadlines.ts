import { TaxDeadline } from './types';

/**
 * Genera l'elenco completo degli adempimenti fiscali e societari per FloreMoria S.r.l.
 * per l'anno in corso (e successivo) impostando i relativi stati di urgenza.
 */
export function getUpcomingDeadlines(completedIds: string[] = []): TaxDeadline[] {
    const today = new Date();
    // Imposta ore a zero per il calcolo preciso dei giorni rimanenti
    today.setHours(0, 0, 0, 0);
    
    const currentYear = today.getFullYear();
    const deadlines: TaxDeadline[] = [];

    // Helper per aggiungere una scadenza e calcolarne lo stato di urgenza
    const addDeadline = (
        id: string,
        title: string,
        category: TaxDeadline['category'],
        dueDateStr: string,
        frequency: TaxDeadline['frequency'],
        description: string,
        externalRef?: string
    ) => {
        const dueDate = new Date(dueDateStr);
        dueDate.setHours(0, 0, 0, 0);

        const diffTime = dueDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const isCompleted = completedIds.includes(id);
        
        let status: TaxDeadline['status'] = 'PENDING';
        let isUrgent = false;

        if (isCompleted) {
            status = 'COMPLETED';
        } else if (daysRemaining <= 10) {
            status = 'URGENT';
            isUrgent = true;
        }

        deadlines.push({
            id,
            title,
            category,
            dueDate: dueDateStr,
            frequency,
            description,
            status,
            isUrgent,
            daysRemaining,
            externalRef
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

    // Ordina le scadenze: prima quelle urgenti/imminenti (date più vicine), poi le altre
    // Contabilità operativa FloreMoria: solo da Q2 2026 (1° aprile 2026) in avanti.
    // Esclude anche scadenze scadute da oltre 90 giorni (rumore pregresso).
    const OPERATIONAL_START = '2026-04-01';
    const staleCutoff = new Date(today);
    staleCutoff.setDate(staleCutoff.getDate() - 90);

    return deadlines
        .filter((d) => {
            if (d.dueDate < OPERATIONAL_START) return false;
            const due = new Date(d.dueDate);
            due.setHours(0, 0, 0, 0);
            if (due < staleCutoff) return false;
            return true;
        })
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}
