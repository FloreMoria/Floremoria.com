/**
 * Identità anagrafica defunto: normalizzazione e deduplica (nome + comune cimitero).
 * Evita profili multipli per lo stesso defunto quando cambiano maiuscole/spazi.
 */
import prisma from '@/lib/prisma';

export interface DeceasedProfileMatch {
    id: string;
    fullName: string;
    cemeteryCity: string;
    cemeteryName: string | null;
    createdAt: Date;
}

/** Trim + spazi multipli → singolo spazio, minuscolo per confronto. */
export function normalizeDeceasedIdentityField(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Valore canonico da persistere (trim + spazi singoli, mantiene il casing originale). */
export function formatDeceasedIdentityField(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

export function buildDeceasedIdentityKey(fullName: string, cemeteryCity: string): string {
    return `${normalizeDeceasedIdentityField(fullName)}|${normalizeDeceasedIdentityField(cemeteryCity)}`;
}

/**
 * Cerca un profilo esistente con stesso nome e comune cimitero (case-insensitive, spazi ripuliti).
 * In caso di più match restituisce il profilo più antico (createdAt ASC).
 */
export async function findMatchingDeceasedProfile(
    fullName: string,
    cemeteryCity: string
): Promise<DeceasedProfileMatch | null> {
    const nameKey = normalizeDeceasedIdentityField(fullName);
    const cityKey = normalizeDeceasedIdentityField(cemeteryCity);
    if (!nameKey || !cityKey) return null;

    const rows = await prisma.$queryRaw<
        Array<{
            id: string;
            fullName: string;
            cemeteryCity: string;
            cemeteryName: string | null;
            createdAt: Date;
        }>
    >`
        SELECT id, "fullName", "cemeteryCity", "cemeteryName", "createdAt"
        FROM "DeceasedProfile"
        WHERE LOWER(REGEXP_REPLACE(TRIM("fullName"), '\\s+', ' ', 'g')) = ${nameKey}
          AND LOWER(REGEXP_REPLACE(TRIM("cemeteryCity"), '\\s+', ' ', 'g')) = ${cityKey}
        ORDER BY "createdAt" ASC
        LIMIT 1
    `;

    return rows[0] ?? null;
}

/**
 * Restituisce l'ID profilo canonico per un ordine: riusa se censito, altrimenti crea.
 */
export async function resolveDeceasedProfileForOrder(input: {
    deceasedName: string;
    cemeteryCity: string;
    cemeteryName?: string | null;
}): Promise<string> {
    const existing = await findMatchingDeceasedProfile(input.deceasedName, input.cemeteryCity);
    if (existing) {
        const cemeteryName = input.cemeteryName?.trim();
        if (cemeteryName && !existing.cemeteryName) {
            await prisma.deceasedProfile.update({
                where: { id: existing.id },
                data: { cemeteryName: formatDeceasedIdentityField(cemeteryName) },
            });
        }
        return existing.id;
    }

    const profile = await prisma.deceasedProfile.create({
        data: {
            fullName: formatDeceasedIdentityField(input.deceasedName),
            cemeteryCity: formatDeceasedIdentityField(input.cemeteryCity),
            cemeteryName: input.cemeteryName?.trim()
                ? formatDeceasedIdentityField(input.cemeteryName)
                : null,
        },
        select: { id: true },
    });

    return profile.id;
}
