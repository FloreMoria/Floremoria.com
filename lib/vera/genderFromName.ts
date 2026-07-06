/**
 * Rilevamento genere da nome proprio italiano (per morfologia Lei/La/Li).
 * Usa profile.name dal webhook WhatsApp (es. "Luciano", "Isabella").
 */

export type ItalianGender = 'maschile' | 'femminile' | 'neutro';

const FEMALE_NAMES = new Set([
    'isabella', 'maria', 'anna', 'giulia', 'francesca', 'laura', 'elena', 'chiara', 'sara',
    'valentina', 'alessandra', 'roberta', 'silvia', 'paola', 'lucia', 'carmen', 'rachele',
    'ermelinda', 'antonella', 'simona', 'martina', 'federica', 'barbara', 'cristina',
    'patrizia', 'monica', 'daniela', 'elisa', 'giovanna', 'teresa', 'rosa', 'lidia',
]);

const MALE_NAMES = new Set([
    'luciano', 'carlo', 'marco', 'giuseppe', 'antonio', 'francesco', 'salvatore', 'giovanni',
    'paolo', 'andrea', 'stefano', 'michele', 'roberto', 'alessandro', 'matteo', 'lorenzo',
    'davide', 'fabio', 'massimo', 'claudio', 'enrico', 'mario', 'luigi', 'pietro', 'sergio',
]);

function normalizeNameToken(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');
}

export function extractFirstNameFromProfile(profileName?: string | null): string {
    if (!profileName?.trim()) return '';
    const cleaned = profileName.trim().replace(/^gentile\s+/i, '');
    const [first] = cleaned.split(/\s+/);
    return first ?? cleaned;
}

export function detectGenderFromName(profileName?: string | null): ItalianGender {
    const first = normalizeNameToken(extractFirstNameFromProfile(profileName));
    if (!first) return 'neutro';
    if (FEMALE_NAMES.has(first)) return 'femminile';
    if (MALE_NAMES.has(first)) return 'maschile';

    if (first.endsWith('a') && !first.endsWith('ia') && first.length > 3) return 'femminile';
    if (first.endsWith('o') || first.endsWith('e') && first.length > 3) return 'maschile';

    return 'neutro';
}

export function buildGenderMorphologyBlock(profileName?: string | null): string {
    const firstName = extractFirstNameFromProfile(profileName);
    const gender = detectGenderFromName(profileName);

    if (!firstName) {
        return 'GENERE: non disponibile — usi forme neutre e inclusive (La/Le).';
    }

    const hints: Record<ItalianGender, string> = {
        femminile: `GENERE: femminile (nome "${firstName}") — adatti participi e aggettivi: "La ringrazio", "informata", "sicura".`,
        maschile: `GENERE: maschile (nome "${firstName}") — adatti participi e aggettivi: "Lo ringrazio", "informato", "sicuro".`,
        neutro: `GENERE: neutro (nome "${firstName}") — preferisca costruzioni inclusive senza assumere il genere.`,
    };

    return hints[gender];
}
