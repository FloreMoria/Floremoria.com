/**
 * Modulo 8 — Risk & Compliance.
 * Scoring rischi, scadenzario, alert cassa, anomalie bilancio.
 */

export const RISK_COMPLIANCE_SKILL_ID = 'risk_compliance' as const;

export type RiskLevel = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BASSO';

export type RiskScore = {
    level: RiskLevel;
    emoji: '🔴' | '🟠' | '🟡' | '🟢';
    code: string;
    title: string;
    detail: string;
};

export function riskEmoji(level: RiskLevel): RiskScore['emoji'] {
    switch (level) {
        case 'CRITICO':
            return '🔴';
        case 'ALTO':
            return '🟠';
        case 'MEDIO':
            return '🟡';
        default:
            return '🟢';
    }
}

export function scoreRisk(params: {
    code: string;
    title: string;
    detail: string;
    level: RiskLevel;
}): RiskScore {
    return {
        ...params,
        emoji: riskEmoji(params.level),
    };
}

export type CalendarItem = {
    id: string;
    domain: 'fiscale' | 'societario' | 'lavoro' | 'altro';
    label: string;
    indicativeDate: string;
    note: string;
};

export function buildComplianceCalendar(year: number): CalendarItem[] {
    return [
        {
            id: 'iva_q1',
            domain: 'fiscale',
            label: 'Liquidazione IVA Q1',
            indicativeDate: `${year}-05-16`,
            note: 'Verify calendario AdE',
        },
        {
            id: 'iva_q2',
            domain: 'fiscale',
            label: 'Liquidazione IVA Q2',
            indicativeDate: `${year}-09-16`,
            note: 'Verify calendario AdE',
        },
        {
            id: 'bilancio',
            domain: 'societario',
            label: 'Approvazione bilancio',
            indicativeDate: `${year}-04-30`,
            note: 'Termine ordinario assemblea — Verify proroghe',
        },
        {
            id: 'redditi',
            domain: 'fiscale',
            label: 'Dichiarazione REDDITI / IRAP',
            indicativeDate: `${year}-11-30`,
            note: 'Scadenze telematiche — Verify AdE anno',
        },
        {
            id: 'startup_status',
            domain: 'societario',
            label: 'Monitoraggio status Startup Innovativa',
            indicativeDate: `${year}-12-31`,
            note: 'Permanenza sezione speciale / requisiti L. 193/2024',
        },
    ];
}

export function assessLiquidityRisk(params: {
    runwayMonths: number | null;
    cashPositive: boolean;
}): RiskScore {
    if (params.cashPositive || params.runwayMonths == null) {
        return scoreRisk({
            code: 'LIQ_OK',
            title: 'Liquidità',
            detail: 'Burn non positivo o runway non applicabile',
            level: 'BASSO',
        });
    }
    if (params.runwayMonths < 3) {
        return scoreRisk({
            code: 'LIQ_CRIT',
            title: 'Rischio insolvenza / cassa',
            detail: `Runway ${params.runwayMonths} mesi (< 3)`,
            level: 'CRITICO',
        });
    }
    if (params.runwayMonths < 6) {
        return scoreRisk({
            code: 'LIQ_HIGH',
            title: 'Cassa sotto pressione',
            detail: `Runway ${params.runwayMonths} mesi (< 6)`,
            level: 'ALTO',
        });
    }
    if (params.runwayMonths < 12) {
        return scoreRisk({
            code: 'LIQ_MED',
            title: 'Monitoraggio cassa',
            detail: `Runway ${params.runwayMonths} mesi`,
            level: 'MEDIO',
        });
    }
    return scoreRisk({
        code: 'LIQ_OK',
        title: 'Liquidità adeguata',
        detail: `Runway ${params.runwayMonths} mesi`,
        level: 'BASSO',
    });
}

export type BalanceAnomaly = {
    code: string;
    message: string;
    level: RiskLevel;
};

/** Controlli euristici su coerenza aggregati (non sostituiscono revisione). */
export function detectBalanceAnomalies(params: {
    revenuesCents: number;
    costsCents: number;
    cashCents: number;
    receivablesCents: number;
    payablesCents: number;
}): BalanceAnomaly[] {
    const anomalies: BalanceAnomaly[] = [];
    if (params.cashCents < 0) {
        anomalies.push({
            code: 'NEG_CASH',
            message: 'Cassa negativa nello snapshot',
            level: 'CRITICO',
        });
    }
    if (params.revenuesCents > 0 && params.costsCents > params.revenuesCents * 2) {
        anomalies.push({
            code: 'COST_SPIKE',
            message: 'Costi > 2× ricavi nel periodo analizzato',
            level: 'ALTO',
        });
    }
    if (
        params.receivablesCents > 0 &&
        params.revenuesCents > 0 &&
        params.receivablesCents > params.revenuesCents
    ) {
        anomalies.push({
            code: 'AR_HIGH',
            message: 'Crediti superiori ai ricavi del periodo — verificare aging',
            level: 'MEDIO',
        });
    }
    if (params.payablesCents > params.cashCents * 3 && params.cashCents >= 0) {
        anomalies.push({
            code: 'AP_PRESSURE',
            message: 'Debiti fornitori elevati vs cassa',
            level: 'ALTO',
        });
    }
    if (!anomalies.length) {
        anomalies.push({
            code: 'NONE',
            message: 'Nessuna anomalia euristica rilevata',
            level: 'BASSO',
        });
    }
    return anomalies;
}

export const riskComplianceSkillMeta = {
    id: RISK_COMPLIANCE_SKILL_ID,
    module: 8 as const,
    name: 'Risk & Compliance',
    normativeRefs: ['Scadenziario AdE', 'Codice della crisi (monitoraggio)', 'Compliance societaria'],
};
