/**
 * Helper universale di formattazione per nomi e cognomi di utenti, acquirenti e fioristi in FloreMoria.
 *
 * Regole:
 * 1. Title Case rigoroso: prima lettera di ogni parola maiuscola, tutto il resto minuscolo (es. "MARIO ROSSI" -> "Mario Rossi").
 * 2. Gestione corretta di apostrofi (es. "D'Angelo", "Sant'Elia", "Dell'Acqua") e trattini (es. "Maria-Teresa", "Jean-Claude").
 * 3. Gestione particelle e cognomi composti (es. "De Luca", "Di Mauro", "San Marco").
 * 4. Inversione automatica se l'input si presenta con virgola ("Rossi, Mario" -> "Mario Rossi") o formato anagrafico con cognome noto prima.
 * 5. Input flessibile (stringa singola, due stringhe firstName/lastName, o oggetto { firstName, lastName, fullName, name }).
 * 6. Ordinamento alfabetico per cognome A-Z accurato (tenendo conto di particelle come De, Di, Del, D', ecc.).
 */

import {
    capitalizeWord,
    toDeceasedTitleCase,
    formatDeceasedName,
    SURNAME_PARTICLES,
    ITALIAN_FIRST_NAMES,
} from './formatDeceasedName';

export { capitalizeWord, SURNAME_PARTICLES, ITALIAN_FIRST_NAMES };

export type PersonNameInput =
    | string
    | null
    | undefined
    | {
          firstName?: string | null;
          lastName?: string | null;
          fullName?: string | null;
          name?: string | null;
          buyerFullName?: string | null;
          ownerName?: string | null;
      };

/**
 * Converte una stringa in Title Case per nomi di persona.
 */
export function toPersonTitleCase(raw: string): string {
    return toDeceasedTitleCase(raw);
}

/**
 * Estrae e formatta il nome completo di una persona in Title Case (Nome Cognome).
 *
 * @example
 * formatPersonName("MARIO ROSSI") => "Mario Rossi"
 * formatPersonName("giuseppe de luca") => "Giuseppe De Luca"
 * formatPersonName("mario", "rossi") => "Mario Rossi"
 * formatPersonName("Rossi, Mario") => "Mario Rossi"
 * formatPersonName("D'ANGELO LUIGI") => "Luigi D'Angelo"
 */
export function formatPersonName(
    firstOrInput?: PersonNameInput,
    secondOrFallback?: string | null,
    fallbackValue: string = ''
): string {
    // Se vengono passati due parametri stringa distinti: formatPersonName("Mario", "Rossi")
    if (
        typeof firstOrInput === 'string' &&
        typeof secondOrFallback === 'string' &&
        secondOrFallback.trim().length > 0 &&
        !secondOrFallback.startsWith('fallback:')
    ) {
        const first = toPersonTitleCase(firstOrInput);
        const last = toPersonTitleCase(secondOrFallback);
        const joined = [first, last].filter(Boolean).join(' ').trim();
        return joined || fallbackValue;
    }

    const fallback = typeof secondOrFallback === 'string' ? secondOrFallback : fallbackValue;

    if (!firstOrInput) {
        return fallback;
    }

    if (typeof firstOrInput === 'string') {
        const trimmed = firstOrInput.trim();
        if (!trimmed) return fallback;
        return formatDeceasedName(trimmed, fallback);
    }

    // Oggetto strutturato
    const first = firstOrInput.firstName?.trim() || '';
    const last = firstOrInput.lastName?.trim() || '';
    const full =
        firstOrInput.fullName?.trim() ||
        firstOrInput.name?.trim() ||
        firstOrInput.buyerFullName?.trim() ||
        firstOrInput.ownerName?.trim() ||
        '';

    if (first || last) {
        const formattedFirst = toPersonTitleCase(first);
        const formattedLast = toPersonTitleCase(last);
        const combined = [formattedFirst, formattedLast].filter(Boolean).join(' ').trim();
        return combined || fallback;
    }

    if (full) {
        return formatDeceasedName(full, fallback);
    }

    return fallback;
}

/** Alias per formatPersonName per chiarezza semantica sui campi utente */
export function formatUserName(name?: string | null, fallback: string = ''): string {
    return formatPersonName(name, fallback);
}

/** Alias per formatPersonName per chiarezza semantica sui campi acquirente */
export function formatBuyerName(buyerFullName?: string | null, fallback: string = ''): string {
    return formatPersonName(buyerFullName, fallback);
}

/**
 * Estrae il cognome da un nominativo completo per facilitare l'ordinamento alfabetico.
 * Riconosce particelle come "De", "Di", "Del", "Della", "San", "D'", ecc.
 */
export function extractSurname(fullName: string | null | undefined): string {
    const raw = (fullName || '').trim();
    if (!raw) return '';

    // Se contiene virgola: "Rossi, Mario" -> cognome è "Rossi"
    if (raw.includes(',')) {
        return raw.split(',')[0].trim();
    }

    const normalized = formatPersonName(raw);
    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return parts[0] || '';

    // Controlla se la penultima parola è una particella cognominale (es. "Giuseppe De Luca")
    if (parts.length >= 2) {
        const secondToLast = parts[parts.length - 2].toLowerCase();
        if (SURNAME_PARTICLES.has(secondToLast)) {
            // Controlla se c'è una terza particella (es. "Da San Martino")
            if (parts.length >= 3) {
                const thirdToLast = parts[parts.length - 3].toLowerCase();
                if (SURNAME_PARTICLES.has(thirdToLast)) {
                    return parts.slice(parts.length - 3).join(' ');
                }
            }
            return parts.slice(parts.length - 2).join(' ');
        }
    }

    return parts[parts.length - 1];
}

/**
 * Genera la chiave di ordinamento alfabetico per cognome (A-Z).
 * Esempio: "Mario Rossi" -> "rossi mario", "Giuseppe De Luca" -> "de luca giuseppe"
 */
export function sortKeyBySurname(fullName: string | null | undefined): string {
    const raw = (fullName || '').trim();
    if (!raw) return 'zzz';

    // Gestione formato con virgola es. "Rossi, Mario"
    if (raw.includes(',')) {
        const [surname, ...rest] = raw.split(',');
        const given = rest.join(' ').trim();
        return `${surname.trim().toLocaleLowerCase('it')} ${given.toLocaleLowerCase('it')}`.trim();
    }

    const formatted = formatPersonName(raw);
    const parts = formatted.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return parts[0]!.toLocaleLowerCase('it');

    // Cerca particelle cognominali
    let surnameStartIndex = parts.length - 1;
    if (parts.length >= 2 && SURNAME_PARTICLES.has(parts[parts.length - 2].toLowerCase())) {
        surnameStartIndex = parts.length - 2;
        if (parts.length >= 3 && SURNAME_PARTICLES.has(parts[parts.length - 3].toLowerCase())) {
            surnameStartIndex = parts.length - 3;
        }
    }

    const surname = parts.slice(surnameStartIndex).join(' ');
    const given = parts.slice(0, surnameStartIndex).join(' ');

    return `${surname.toLocaleLowerCase('it')} ${given.toLocaleLowerCase('it')}`.trim();
}

/**
 * Confronta due nominativi per ordinamento alfabetico per COGNOME (A-Z).
 */
export function compareBySurname(
    a: string | null | undefined,
    b: string | null | undefined
): number {
    return sortKeyBySurname(a).localeCompare(sortKeyBySurname(b), 'it', { sensitivity: 'base' });
}
