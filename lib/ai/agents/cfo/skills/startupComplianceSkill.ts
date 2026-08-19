/**
 * Modulo 4 — Startup Innovativa Compliance (L. 193/2024, DL 179/2012 art. 25).
 */

export const STARTUP_COMPLIANCE_SKILL_ID = 'startup_compliance' as const;

export type StartupChecklistInput = {
    rdSpendRatio?: number | null;
    /** Quota personale qualificato (≥ 1/3) oppure personale con laurea magistrale (≥ 2/3). */
    qualifiedStaffRatio?: number | null;
    mastersStaffRatio?: number | null;
    hasRegisteredPatentOrSoftware?: boolean | null;
    distributesProfits?: boolean | null;
    yearsInSpecialSection?: number | null;
    meetsDimensionalTemporalRequirements?: boolean | null;
    consideringPmiInnovativaTransition?: boolean | null;
};

export type ChecklistItem = {
    id: string;
    label: string;
    ok: boolean | null;
    detail: string;
    severity: 'critical' | 'high' | 'medium' | 'info';
};

export type StartupChecklistResult = {
    items: ChecklistItem[];
    allCriticalOk: boolean;
    summary: string;
    pmiInnovativaHint: string;
    normativeRefs: string[];
};

export function evaluateStartupInnovativaCompliance(
    input: StartupChecklistInput
): StartupChecklistResult {
    const items: ChecklistItem[] = [];

    const rd = input.rdSpendRatio;
    items.push({
        id: 'rd_15',
        label: 'Spese R&S ≥ 15% dei costi',
        ok: rd == null ? null : rd >= 0.15,
        detail:
            rd == null
                ? 'Dato R&S mancante — Verify bilanci / prospetto costi'
                : `R&S osservato: ${(rd * 100).toFixed(1)}% (soglia 15%)`,
        severity: 'critical',
    });

    const staff = input.qualifiedStaffRatio;
    const masters = input.mastersStaffRatio;
    const ip = Boolean(input.hasRegisteredPatentOrSoftware);
    const staffOk =
        ip ||
        (staff != null && staff >= 1 / 3) ||
        (masters != null && masters >= 2 / 3);
    const staffKnown =
        input.hasRegisteredPatentOrSoftware != null ||
        staff != null ||
        masters != null;

    items.push({
        id: 'staff_or_ip',
        label:
            '≥ 1/3 personale qualificato OPPURE ≥ 2/3 lauree magistrali OPPURE software/brevetto registrato',
        ok: staffKnown ? staffOk : null,
        detail: ip
            ? 'Titolarità software/brevetto dichiarata'
            : !staffKnown
              ? 'Mancano dati personale / IP'
              : `Qualificati: ${staff != null ? `${(staff * 100).toFixed(1)}%` : 'n/d'}; Magistrali: ${
                    masters != null ? `${(masters * 100).toFixed(1)}%` : 'n/d'
                }`,
        severity: 'critical',
    });

    items.push({
        id: 'no_profit_distribution',
        label: 'Vincolo: non distribuzione utili in regime',
        ok:
            input.distributesProfits == null
                ? null
                : input.distributesProfits === false,
        detail:
            input.distributesProfits == null
                ? 'Verificare delibere / bilancio'
                : input.distributesProfits
                  ? '⚠️ Distribuzione utili segnalata'
                  : 'Nessuna distribuzione utili dichiarata',
        severity: 'critical',
    });

    const years = input.yearsInSpecialSection;
    items.push({
        id: 'max_5_years',
        label: 'Permanenza sezione speciale ≤ 5 anni',
        ok: years == null ? null : years <= 5,
        detail:
            years == null
                ? 'Verificare data iscrizione (Registro Imprese)'
                : `Anni in sezione: ${years} (max 5)`,
        severity: 'critical',
    });

    items.push({
        id: 'l193_dimensional',
        label: 'Requisiti dimensionali/temporali L. 193/2024',
        ok:
            input.meetsDimensionalTemporalRequirements == null
                ? null
                : Boolean(input.meetsDimensionalTemporalRequirements),
        detail: 'Confermare Tier 1 (Normattiva / MIMIT / RI) — non inventare soglie',
        severity: 'high',
    });

    const nearExpiry = years != null && years >= 4;
    items.push({
        id: 'pmi_transition',
        label: 'Percorso transizione a PMI Innovativa',
        ok:
            input.consideringPmiInnovativaTransition == null
                ? nearExpiry
                    ? false
                    : null
                : Boolean(input.consideringPmiInnovativaTransition),
        detail: nearExpiry
            ? 'Avvicinamento limite 5 anni: pianificare PMI Innovativa / exit regime'
            : 'Monitorare scadenza sezione speciale e requisiti PMI Innovativa',
        severity: nearExpiry ? 'high' : 'info',
    });

    const criticalFails = items.filter((i) => i.severity === 'critical' && i.ok === false);
    const known = items.filter((i) => i.ok !== null);

    return {
        items,
        allCriticalOk:
            criticalFails.length === 0 &&
            items.filter((i) => i.severity === 'critical').every((i) => i.ok !== false),
        summary: `Startup checklist: ${known.filter((i) => i.ok).length}/${known.length} OK; criticità: ${criticalFails.length}. Valutazione preliminare soggetta a conferma del professionista abilitato.`,
        pmiInnovativaHint:
            'Post-5 anni: valutare iscrizione PMI Innovativa (requisiti distinti) — Verify MIMIT / normativa vigente.',
        normativeRefs: ['DL 179/2012 art. 25', 'L. 193/2024', 'Registro Imprese — sezione speciale'],
    };
}

export const startupComplianceSkillMeta = {
    id: STARTUP_COMPLIANCE_SKILL_ID,
    module: 4 as const,
    name: 'Startup Innovativa',
    normativeRefs: ['DL 179/2012 art. 25', 'L. 193/2024'],
};
