/**
 * URL allegati fiscali Contabilità — non devono mai entrare in GdM / bacheche / DeliveryProof.
 */

const FISCAL_BLOB_MARKERS = [
    '/floremoria-finance/',
    'floremoria-finance/manual-expenses/',
    'floremoria-finance/florist-receipts/',
    'floremoria-finance/receipts/',
];

export function isFiscalOnlyMediaUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    const u = url.toLowerCase();
    return FISCAL_BLOB_MARKERS.some((m) => u.includes(m));
}

export function assertNotFiscalMediaForDelivery(url: string): void {
    if (isFiscalOnlyMediaUrl(url)) {
        throw new Error(
            'Questo file è un allegato fiscale (Contabilità). Non può essere pubblicato in GdM, bacheche o foto di consegna. Caricalo da Passivo → scontrino fiscale.'
        );
    }
}
