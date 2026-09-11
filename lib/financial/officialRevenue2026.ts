/**
 * Fatturato ufficiale 2026 — lista operativa ordini (fonte di verità commerciale).
 * Aggiornato 11-09-2026: €4.098,68 su 75 ordini attivi (esclusi annullati, test, pose €0).
 *
 * La cifra €4.587,01 (verbale 09-09-2026) era una stima manuale pre-lista: dismessa.
 */

export const OFFICIAL_REVENUE_2026 = {
    asOf: '2026-09-10',
    activeOrders: 75,
    grossEuro: 4098.68,
    byQuarter: {
        T1: { n: 21, euro: 1038.23 },
        T2: { n: 21, euro: 1211.03 },
        T3: { n: 33, euro: 1849.42 },
    },
    /** Import storico .eu vs nativi .com (lista operativa). */
    byChannel: {
        euStoricoEuro: 1667.02,
        comNativoEuro: 2431.66,
    },
    excluded: {
        cancelled: 0,
        test: 0,
        posesZeroEuro: 4,
        poseOrderNumbers: [
            'FT-MC-26-006',
            'FT-MC-26-005',
            'FT-MC-26-003',
            'FT-MC-26-004',
        ],
    },
    sourceFile: 'docs/verbali/FloreMoria_Ordini_Operativi.csv',
    deprecatedManualEstimateEuro: 4587.01,
    deprecatedManualEstimateNote:
        'docs/verbali/09-09-2026-collegamento-incassi-ordini.md — vendite verificate a mano; sostituita dalla lista operativa.',
} as const;

/** Status ordine che contano come vendita attiva (non solo COMPLETED). */
export const REVENUE_ACTIVE_ORDER_STATUSES = [
    'COMPLETED',
    'IN_PROGRESS',
    'DELIVERING',
    'ACCEPTED',
    /** Consegnato in attesa pagamento fiorista/cliente — comunque ricavo commerciale. */
    'DELIVERED_UNPAID',
] as const;
