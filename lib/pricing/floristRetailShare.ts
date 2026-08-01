/**
 * Compatibilità storica: il compenso fiorista NON usa più percentuali sul retail.
 * Fonte unica: listino rigido in `listini.ts` (FLOREM_NET_Catalogo_Prezzi_e_Link.txt).
 */
import { resolveListinoEntry } from '@/lib/pricing/listini';

/** @deprecated Non usare: restato solo per non rompere import; sempre null → listino fisso. */
export const FLORIST_RETAIL_SHARE = 0;

/**
 * Risolve il compenso in centesimi dal listino ufficiale (mai 65% / stime).
 */
export function resolveFloristCompensationCentsFromRetail(input: {
    slug?: string | null;
    name?: string | null;
    basePriceCents?: number | null;
    isBouquet?: boolean | null;
}): number | null {
    void input.basePriceCents; // vietato usare retail per calcoli percentuali
    const entry = resolveListinoEntry(input.slug, input.name, {
        isBouquet: input.isBouquet,
    });
    return entry ? entry.floristCents : null;
}

export function isZeroFloristCompensoAccessory(
    slug?: string | null,
    name?: string | null
): boolean {
    const entry = resolveListinoEntry(slug, name);
    return entry != null && entry.floristCents === 0;
}
