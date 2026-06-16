/**
 * Query dashboard con degradazione controllata: evita 500 SSR se il DB è in drift
 * (colonne/tabelle mancanti) e logga l'errore per Vercel/server.
 */
export type DashboardQueryResult<T> =
    | { ok: true; data: T }
    | { ok: false; data: T; error: string };

export async function runDashboardQuery<T>(
    label: string,
    fallback: T,
    fn: () => Promise<T>
): Promise<DashboardQueryResult<T>> {
    try {
        const data = await fn();
        return { ok: true, data };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[dashboard] ${label} failed:`, message);
        return { ok: false, data: fallback, error: message };
    }
}

/** Messaggio staff-facing quando il DB non è allineato allo schema Prisma. */
export function isLikelySchemaDriftError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
        lower.includes('does not exist') ||
        lower.includes('column') ||
        lower.includes('relation') ||
        lower.includes('usertype') ||
        lower.includes('userrole') ||
        lower.includes('invalid input value for enum')
    );
}
