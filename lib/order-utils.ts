/**
 * Utility per la generazione strutturata dei Codici Ordine (Floremeria Standard)
 * Formato Richiesto: [2 chars regione]-[3 chars comune]-[2 num cimitero]-[numerazione 7 cifre]
 * Esempio: LO-MIL-00-0000001
 */

interface OrderCodeParams {
    regionCode: string; // Ex: 'LO' per Lombardia
    cityCode: string; // Ex: 'MIL' per Milano
    cemeteryCode?: string; // Ex: '00' di default
    sequentialNumber: number; // Ex: 1 -> diventerà 0000001
}

export function generateOrderCode({
    regionCode,
    cityCode,
    cemeteryCode = '00',
    sequentialNumber
}: OrderCodeParams): string {
    // Pulisce e formatta le stringhe in modo robusto
    const cleanRegion = regionCode.substring(0, 2).toUpperCase().padEnd(2, 'X');
    const cleanCity = cityCode.substring(0, 3).toUpperCase().padEnd(3, 'X');
    const cleanCemetery = cemeteryCode.padStart(2, '0').substring(0, 2);
    
    // Converte il numero in una stringa di 7 cifre esatte (padding con zeri a sinistra)
    // Es: 14 -> "0000014"
    const paddedSequence = sequentialNumber.toString().padStart(7, '0');

    return `${cleanRegion}-${cleanCity}-${cleanCemetery}-${paddedSequence}`;
}

/**
 * Formula il nome SEO-ready per il file della foto in base al codice ordine e al tipo di step.
 * Previene le sovrascritture mantenendo un suffisso numerico o di step.
 */
export function generateDeliveryPhotoFilename(
    orderCode: string, 
    stepType: 'PRIMA' | 'DOPO' | 'DETTAGLIO_1' | 'DETTAGLIO_2',
    isFuneral: boolean
): string {
    // Data in formato DD-MM-YYYY (es. 30-03-2026)
    const d = new Date();
    const formattedDate = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    
    // Il prefisso SEO richiesto dalla direzione aziendale
    const seoPrefix = isFuneral ? 'Fiori_per_funerale' : 'Fiori_sulle_tombe';
    
    // Uniamo tutto. Fiori_sulle_tombe_LO-MIL-00-0000001_30-03-2026_DOPO.webp
    return `${seoPrefix}_${orderCode}_${formattedDate}_${stepType}.webp`;
}
