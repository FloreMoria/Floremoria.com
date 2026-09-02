import {
    sortKeyBySurname,
    compareBySurname,
} from '@/lib/utils/formatPersonName';

export { sortKeyBySurname, compareBySurname };

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
