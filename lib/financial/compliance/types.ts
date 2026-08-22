export type DeadlineUiStatus = 'PENDING' | 'DUE_SOON' | 'PAID' | 'ARCHIVED';

export interface TaxDeadline {
    id: string;
    title: string;
    category: 'IVA' | 'F24' | 'BILANCIO' | 'STARTUP_INNOVATIVA' | 'ESTEROMETRO' | 'DICHIARATIVI' | 'CONTABILITA';
    dueDate: string; // Formato YYYY-MM-DD
    frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
    description: string;
    status: 'PENDING' | 'COMPLETED' | 'URGENT';
    /** Stato UI editabile (override persistito). */
    uiStatus: DeadlineUiStatus;
    isUrgent: boolean; // true se mancano <= 10 giorni o se scaduta
    daysRemaining: number;
    externalRef?: string;
}
