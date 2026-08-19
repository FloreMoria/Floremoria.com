/**
 * Modulo 6 — Finanza Agevolata (MIMIT, Invitalia, SIMEST, crediti R&S / 5.0, de minimis).
 */

export const INCENTIVES_GRANTS_SKILL_ID = 'incentives_grants' as const;

export type GrantProgram = {
    id: string;
    name: string;
    agency: 'MIMIT' | 'Invitalia' | 'SIMEST' | 'AdE' | 'Altro';
    focus: string;
    eligibilityHints: string[];
    deMinimisRelevant: boolean;
    monitorNote: string;
};

export const GRANT_PROGRAM_CATALOG: GrantProgram[] = [
    {
        id: 'smart_start',
        name: 'Smart&Start Italia',
        agency: 'Invitalia',
        focus: 'Startup innovative — investimenti e spese ammissibili',
        eligibilityHints: [
            'Startup innovativa iscritta sezione speciale',
            'Progetto di sviluppo / go-to-market',
            'Verificare apertura sportello e circolari Invitalia',
        ],
        deMinimisRelevant: true,
        monitorNote: 'Verify disponibilità sportello prima di candidare',
    },
    {
        id: 'nuove_imprese_tasso_zero',
        name: 'Nuove Imprese a Tasso Zero',
        agency: 'Invitalia',
        focus: 'Giovani / imprenditoria femminile — mutuo agevolato',
        eligibilityHints: [
            'Requisiti soggettivi (età/genere) da Verify su bando vigente',
            'Business plan e copertura finanziaria',
        ],
        deMinimisRelevant: true,
        monitorNote: 'Controllare scadenze e platea beneficiari aggiornata',
    },
    {
        id: 'mimit_generic',
        name: 'Bandi MIMIT (generici / filiere)',
        agency: 'MIMIT',
        focus: 'Agevolazioni ministeriali per innovazione e competitività',
        eligibilityHints: ['Match codice ATECO / dimensione PMI', 'Cumulo con altri aiuti'],
        deMinimisRelevant: true,
        monitorNote: 'Consultare portale MIMIT — non assumere aperture',
    },
    {
        id: 'simest',
        name: 'SIMEST — internazionalizzazione',
        agency: 'SIMEST',
        focus: 'Finanziamenti / contributi per export e presenza estera',
        eligibilityHints: ['Progetto di internazionalizzazione', 'Solidità patrimoniale'],
        deMinimisRelevant: true,
        monitorNote: 'Verify linee attive SIMEST / CDP',
    },
    {
        id: 'credito_rs',
        name: 'Credito d’imposta R&S',
        agency: 'AdE',
        focus: 'Spese di ricerca e sviluppo eleggibili',
        eligibilityHints: [
            'Documentazione progetto R&S',
            'Certificazione / asseverazione se richiesta',
        ],
        deMinimisRelevant: false,
        monitorNote: 'Aliquote e massimali cambiano per anno — Verify norma vigente',
    },
    {
        id: 'credito_innovazione',
        name: 'Credito d’imposta Innovazione / design',
        agency: 'AdE',
        focus: 'Attività di innovazione tecnologica',
        eligibilityHints: ['Distinguere da R&S pura', 'Tracciabilità costi'],
        deMinimisRelevant: false,
        monitorNote: 'Verify circolari AdE anno di competenza',
    },
    {
        id: 'transizione_50',
        name: 'Transizione 5.0',
        agency: 'MIMIT',
        focus: 'Investimenti digitalizzazione / efficientamento energetico',
        eligibilityHints: [
            'Beni strumentali 4.0/5.0',
            'Riduzione consumi energetici documentata',
        ],
        deMinimisRelevant: true,
        monitorNote: 'Verificare piattaforma e cumulo de minimis / altri aiuti',
    },
];

/** Soglia de minimis UE tipica PMI (indicativa — Verify regolamento vigente). */
export const DE_MINIMIS_CEILING_EUR_INDICATIVE = 300_000;

export type DeMinimisCheck = {
    ceilingEur: number;
    alreadyUsedEur: number;
    remainingEur: number;
    withinLimit: boolean;
    note: string;
};

export function checkDeMinimisHeadroom(params: {
    alreadyUsedEur: number;
    plannedAidEur: number;
    ceilingEur?: number;
}): DeMinimisCheck {
    const ceiling = params.ceilingEur ?? DE_MINIMIS_CEILING_EUR_INDICATIVE;
    const used = Math.max(0, params.alreadyUsedEur);
    const remaining = Math.max(0, ceiling - used);
    const within = used + Math.max(0, params.plannedAidEur) <= ceiling;
    return {
        ceilingEur: ceiling,
        alreadyUsedEur: used,
        remainingEur: remaining,
        withinLimit: within,
        note: 'Soglia indicativa — Verify regolamento de minimis UE e periodo mobile triennale',
    };
}

export function listEligibleProgramsForStartup(hints: {
    isStartupInnovativa: boolean;
    hasExportPlan?: boolean;
    hasRdProjects?: boolean;
}): GrantProgram[] {
    return GRANT_PROGRAM_CATALOG.filter((p) => {
        if (p.id === 'smart_start' || p.id === 'nuove_imprese_tasso_zero') {
            return hints.isStartupInnovativa;
        }
        if (p.id === 'simest') return Boolean(hints.hasExportPlan);
        if (p.id === 'credito_rs' || p.id === 'credito_innovazione') {
            return hints.hasRdProjects !== false;
        }
        return true;
    });
}

export const incentivesGrantsSkillMeta = {
    id: INCENTIVES_GRANTS_SKILL_ID,
    module: 6 as const,
    name: 'Finanza Agevolata',
    normativeRefs: [
        'Invitalia Smart&Start',
        'MIMIT / Transizione 5.0',
        'Regolamento de minimis UE',
        'Crediti d’imposta R&S AdE',
    ],
};
