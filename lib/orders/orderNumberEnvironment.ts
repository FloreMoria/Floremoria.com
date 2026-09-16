/**
 * Prefisso PT- riservato ai soli ordini isTest=true.
 * Un ordine live non deve mai ricevere PT-; un test non deve usare FF/FT operativi.
 */
export class OrderNumberEnvironmentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OrderNumberEnvironmentError';
    }
}

export function assertOrderNumberMatchesTestFlag(orderNumber: string, isTest: boolean): void {
    const n = orderNumber.trim().toUpperCase();
    const isPt = n.startsWith('PT-');
    if (isTest && !isPt) {
        throw new OrderNumberEnvironmentError(
            `Ordine di test deve usare prefisso PT- (ricevuto: ${orderNumber}).`
        );
    }
    if (!isTest && isPt) {
        throw new OrderNumberEnvironmentError(
            `Prefisso PT- riservato ai soli ordini isTest=true; vietato su ordini live (ricevuto: ${orderNumber}).`
        );
    }
}

export function isPartnerTestOrderNumber(orderNumber: string | null | undefined): boolean {
    return Boolean(orderNumber?.trim().toUpperCase().startsWith('PT-'));
}
