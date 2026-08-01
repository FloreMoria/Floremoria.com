/** Utility pure per form anagrafica defunto (safe per client components). */

export function composeFullName(
    firstName?: string | null,
    lastName?: string | null,
    fallback?: string | null
): string {
    const joined = [firstName, lastName]
        .map((p) => (p || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
    if (joined) return joined;
    return (fallback || '').trim();
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function composeGravePosition(
    graveSector?: string | null,
    graveNumber?: string | null,
    gravePosition?: string | null
): string | null {
    if (typeof gravePosition === 'string' && gravePosition.trim()) {
        return gravePosition.trim();
    }
    const sector = (graveSector || '').trim();
    const number = (graveNumber || '').trim();
    if (!sector && !number) return null;
    if (sector && number) return `${sector} · ${number}`;
    return sector || number;
}

export function parseGravePosition(raw: string | null | undefined): {
    graveSector: string;
    graveNumber: string;
} {
    const value = (raw || '').trim();
    if (!value) return { graveSector: '', graveNumber: '' };
    const parts = value.split(/\s*[·|/]\s*/);
    if (parts.length >= 2) {
        return { graveSector: parts[0].trim(), graveNumber: parts.slice(1).join(' · ').trim() };
    }
    return { graveSector: value, graveNumber: '' };
}

export function toDateInputValue(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}
