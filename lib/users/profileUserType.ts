/**
 * Profilazione commerciale Utente (Nuovo / Abituale / Abbonato).
 * Distinta da ChatSession.userType (UTENTE | FLORIST | UNKNOWN).
 */
import type { ProfileUserType } from '@prisma/client';

export const PROFILE_USER_TYPES: ProfileUserType[] = ['NEW', 'REGULAR', 'SUBSCRIBER'];

export const PROFILE_USER_TYPE_LABELS: Record<ProfileUserType, string> = {
    NEW: 'Utente Nuovo',
    REGULAR: 'Utente Abituale',
    SUBSCRIBER: 'Utente Abbonato',
};

/** Badge Tailwind: azzurro / verde / oro */
export const PROFILE_USER_TYPE_BADGE_CLASS: Record<ProfileUserType, string> = {
    NEW: 'bg-sky-100 text-sky-800',
    REGULAR: 'bg-emerald-100 text-emerald-800',
    SUBSCRIBER: 'bg-amber-100 text-amber-800',
};

export const MAX_PLANNED_DELIVERY_DATES = 10;

export function isProfileUserType(value: unknown): value is ProfileUserType {
    return value === 'NEW' || value === 'REGULAR' || value === 'SUBSCRIBER';
}

export function nextProfileUserType(current: ProfileUserType): ProfileUserType {
    const idx = PROFILE_USER_TYPES.indexOf(current);
    return PROFILE_USER_TYPES[(idx + 1) % PROFILE_USER_TYPES.length]!;
}

export function sanitizePlannedDeliveryDates(raw: unknown): string[] {
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : [];
    const normalized = list
        .map((value) => String(value || '').trim().slice(0, 10))
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    const unique = Array.from(new Set(normalized));
    unique.sort();
    return unique.slice(0, MAX_PLANNED_DELIVERY_DATES);
}

export function profileUserTypePromptLabel(type: ProfileUserType | null | undefined): string {
    if (!type) return 'Non classificata';
    return `${PROFILE_USER_TYPE_LABELS[type]} (${type})`;
}
