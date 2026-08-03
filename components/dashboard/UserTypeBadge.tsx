'use client';

import { useState } from 'react';
import type { ProfileUserType } from '@prisma/client';
import {
    nextProfileUserType,
    PROFILE_USER_TYPE_BADGE_CLASS,
    PROFILE_USER_TYPE_LABELS,
} from '@/lib/users/profileUserType';

type UserTypeBadgeProps = {
    userId: string;
    initialType?: ProfileUserType | null;
    /** Se false, solo lettura (es. riga virtuale senza User reale). */
    interactive?: boolean;
    size?: 'sm' | 'md';
    onChanged?: (next: ProfileUserType) => void;
};

/**
 * Badge a colori a ciclo rapido: Nuovo → Abituale → Abbonato.
 * Persiste subito su /api/dashboard/users/[id].
 */
export default function UserTypeBadge({
    userId,
    initialType = 'NEW',
    interactive = true,
    size = 'sm',
    onChanged,
}: UserTypeBadgeProps) {
    const [type, setType] = useState<ProfileUserType>(initialType || 'NEW');
    const [saving, setSaving] = useState(false);

    const canEdit = interactive && Boolean(userId) && !String(userId).startsWith('virtual_');
    const sizeClass = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs';

    const cycle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (!canEdit || saving) return;

        const previous = type;
        const next = nextProfileUserType(type);
        setType(next);
        setSaving(true);
        try {
            const res = await fetch(`/api/dashboard/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userType: next }),
            });
            const payload = await res.json();
            if (!res.ok || !payload?.ok) {
                throw new Error(payload?.error || 'Aggiornamento non riuscito.');
            }
            onChanged?.(next);
        } catch (err) {
            setType(previous);
            alert(err instanceof Error ? err.message : 'Errore aggiornamento profilazione.');
        } finally {
            setSaving(false);
        }
    };

    const className = [
        'inline-flex items-center gap-1 rounded-full font-semibold transition-all select-none',
        sizeClass,
        PROFILE_USER_TYPE_BADGE_CLASS[type],
        canEdit ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-current/30' : 'cursor-default',
        saving ? 'opacity-60' : '',
    ]
        .filter(Boolean)
        .join(' ');

    if (!canEdit) {
        return (
            <span className={className} title={PROFILE_USER_TYPE_LABELS[type]}>
                {PROFILE_USER_TYPE_LABELS[type]}
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={cycle}
            disabled={saving}
            className={className}
            title="Clic per cambiare profilazione (Nuovo → Abituale → Abbonato)"
            aria-label={`Profilazione: ${PROFILE_USER_TYPE_LABELS[type]}. Clic per cambiare.`}
        >
            {PROFILE_USER_TYPE_LABELS[type]}
            {saving ? '…' : ''}
        </button>
    );
}
