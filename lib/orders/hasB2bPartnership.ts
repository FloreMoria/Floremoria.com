/**
 * True se l'ordine è collegato a una partnership B2B attiva (AF, agenzia, referral).
 * Perché: email di trasparenza provider non devono partire su ordini B2C standard.
 */
export function orderHasB2bPartnership(order: {
    agencyId?: string | null;
    referralPartnerId?: string | null;
    partnershipChannel?: string | null;
    agencyName?: string | null;
}): boolean {
    if (order.agencyId?.trim()) return true;
    if (order.referralPartnerId?.trim()) return true;
    if (order.partnershipChannel?.trim()) return true;
    if (order.agencyName?.trim()) return true;
    return false;
}
