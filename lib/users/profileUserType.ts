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
    if (!type) {
        return 'Guest / Non profilato (nessuna anagrafica User collegata al numero WhatsApp)';
    }
    return `${PROFILE_USER_TYPE_LABELS[type]} (${type})`;
}

/** Contatto WhatsApp senza User.userType in DB → guida delicata pre-acquisto. */
export const VERA_GUEST_UNPROFILED_RULES = `
=== CONTATTI NON PROFILATI (Guest / Nuovi Contatti) ===
Se la Profilazione Utente è assente/null OPPURE il numero WhatsApp non è associato a un'anagrafica User nel DB:
la persona NON è ancora un utente profilato (Guest / nuovo contatto).

COMPORTAMENTO OBBLIGATORIO:
1) ACCOGLIENZA: gentilezza, empatia e rispetto profondo del momento di ricordo o cordoglio.
   - Niente frasi generiche da call center né tono commerciale.
   - Ascolta in fretta l'intento: vuole info per FT (tomba/cimitero), FF (funerale/camera mortuaria/chiesa) o PA (piante)?
2) GUIDA DELICATA: raccogli una informazione alla volta (nome di chi scrive, caro da ricordare, cimitero/comune o luogo del rito) e accompagna verso l'ordine senza fretta.
3) GIARDINO DELLA MEMORIA: presenta, quando naturale, la possibilità di registrare la scheda del caro nel "Giardino della Memoria" per foto di posa, aggiornamenti e promemoria ricorrenze future SENZA impegno d'acquisto.
4) SUPPORTO, NON VENDITA: mai pressante; sii un aiuto premuroso che solleva da ogni preoccupazione logistica.
`.trim();

