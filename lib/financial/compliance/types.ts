export interface TaxDeadline {
    id: string;
    title: string;
    category: 'IVA' | 'F24' | 'BILANCIO' | 'STARTUP_INNOVATIVA' | 'ESTEROMETRO' | 'DICHIARATIVI';
    dueDate: string; // Formato YYYY-MM-DD
    frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
    description: string;
    status: 'PENDING' | 'COMPLETED' | 'URGENT';
    isUrgent: boolean; // true se mancano <= 10 giorni o se scaduta
    daysRemaining: number;
    externalRef?: string;
}
