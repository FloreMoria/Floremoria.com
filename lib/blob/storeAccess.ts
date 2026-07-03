import { put, type PutCommandOptions, type PutBlobResult } from '@vercel/blob';

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

export function isBlobAccessMismatchError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /private access on a public store|public access on a private store/i.test(msg);
}

type PutBlobOptions = Omit<PutCommandOptions, 'access'>;

/**
 * Carica su Blob provando prima l'accesso configurato (BLOB_STORE_ACCESS),
 * poi l'altro se lo store Vercel non coincide con l'env.
 */
export async function putBlobWithAccessFallback(
    pathname: string,
    body: Parameters<typeof put>[1],
    options: PutBlobOptions
): Promise<PutBlobResult> {
    const preferred = getBlobStoreAccess();
    const fallback: BlobStoreAccess = preferred === 'private' ? 'public' : 'private';

    try {
        return await put(pathname, body, { ...options, access: preferred });
    } catch (err) {
        if (!isBlobAccessMismatchError(err)) throw err;
        console.warn(
            `[blob] access=${preferred} rifiutato dallo store, retry con access=${fallback} (${pathname})`
        );
        return await put(pathname, body, { ...options, access: fallback });
    }
}
