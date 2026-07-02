export type BlobStoreAccess = 'public' | 'private';

/**
 * Modalità accesso dello store Vercel Blob collegato a BLOB_READ_WRITE_TOKEN.
 * Deve coincidere con la configurazione dello store in Vercel (Public vs Private).
 *
 * Default: public (compatibile con store esistenti non ancora migrati a Private).
 * Per uno store Private: BLOB_STORE_ACCESS=private
 */
export function getBlobStoreAccess(): BlobStoreAccess {
    const value = process.env.BLOB_STORE_ACCESS?.trim().toLowerCase();
    if (value === 'public' || value === 'private') {
        return value;
    }
    return 'public';
}
