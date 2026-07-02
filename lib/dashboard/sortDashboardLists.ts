/** Chiave ordinamento alfabetico per cognome (ultima parola del nome completo, convenzione IT). */
export function sortKeyBySurname(fullName: string | null | undefined): string {
    const name = (fullName || '').trim();
    if (!name) return 'zzz';

    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return parts[0]!.toLocaleLowerCase('it');

    const surname = parts[parts.length - 1]!;
    const given = parts.slice(0, -1).join(' ');
    return `${surname.toLocaleLowerCase('it')} ${given.toLocaleLowerCase('it')}`;
}

export function compareBySurname(
    a: string | null | undefined,
    b: string | null | undefined
): number {
    return sortKeyBySurname(a).localeCompare(sortKeyBySurname(b), 'it', { sensitivity: 'base' });
}

export function compareByRecentActivity(
    a: { createdAt?: Date | string | null; updatedAt?: Date | string | null },
    b: { createdAt?: Date | string | null; updatedAt?: Date | string | null }
): number {
    const ts = (row: typeof a) => {
        const updated = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
        const created = row.createdAt ? new Date(row.createdAt).getTime() : 0;
        return Math.max(updated, created);
    };
    return ts(b) - ts(a);
}
