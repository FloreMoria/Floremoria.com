/**
 * Intent pre-acquisto / assistenza generica — non collegare ordini storici completati.
 */
import { getItalyOpeningGreeting } from '@/lib/datetime/italyGreeting';
import { formatPersonName } from '@/lib/utils/formatPersonName';

function normalizeForMatch(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const PRE_ACQUISITION_PATTERNS = [
    /prima di (fare|ordinare|acquistare|completare|procedere)/,
    /pre[\s-]?acquisto/,
    /vorrei assistenza/,
    /vorrei informazioni/,
    /vorrei ricevere informazioni/,
    /ricevere informazioni e assistenza/,
    /mi servono informazioni/,
    /avrei bisogno di (informazioni|assistenza)/,
    /non ho ancora ordinato/,
    /devo ancora ordinare/,
    /come funziona/,
    /quanto costa/,
    /listino|prezz/,
    /vorrei mandare fiori/,
    /vorrei inviare fiori/,
    /informazioni su/,
    /prima dell ordine/,
    /salve floremoria/,
    /buongiorno floremoria/,
    /buonasera floremoria/,
];

/** Payload generato dal form contatti web (Nome / Email / Messaggio). */
export function isWebsiteContactFormPayload(message: string): boolean {
    const raw = message || '';
    return /\bnome\s*:/i.test(raw) && /\bemail\s*:/i.test(raw) && /\bmessaggio\s*:/i.test(raw);
}

/** Estrae il nome dal payload form contatti, Title Case. */
export function extractNameFromContactFormPayload(message: string): string | null {
    const match = (message || '').match(/\bnome\s*:\s*([^\n\r]+)/i);
    if (!match?.[1]) return null;
    const formatted = formatPersonName(match[1].trim());
    return formatted || null;
}

/** Messaggio con intento informativo / pre-ordine — non va collegato a ordini storici completati. */
export function isPreAcquisitionIntent(message: string): boolean {
    if (isWebsiteContactFormPayload(message)) return true;
    const m = normalizeForMatch(message);
    if (!m) return false;
    return PRE_ACQUISITION_PATTERNS.some((pattern) => pattern.test(m));
}

/**
 * Nuovo contatto / assistenza generica senza richiesta esplicita su ordine o foto di posa.
 * Include floating WhatsApp CTA, form contatti e saluti + info.
 */
export function isGenericAssistanceOrFirstContactIntent(message: string): boolean {
    if (isWebsiteContactFormPayload(message)) return true;
    if (isPreAcquisitionIntent(message)) return true;

    const m = normalizeForMatch(message);
    if (!m) return false;

    // Codice ordine esplicito → non è assistenza generica
    if (/\b(?:ft|ff|pa|fm)-[a-z]{2}-\d{2}-\d{3,4}\b/.test(m)) return false;

    const hasGreeting = /\b(salve|buongiorno|buon giorno|buonasera|buona sera|ciao)\b/.test(m);
    const wantsHelp = /\b(informazioni|assistenza|aiuto|supporto|vorrei (sapere|chiedere)|mi puo aiutare|mi puo' aiutare)\b/.test(
        m
    );
    if (hasGreeting && wantsHelp) return true;

    // Solo richiesta aperta senza riferimenti a consegna/foto/ordine personale
    if (
        wantsHelp &&
        !/\b(mio ordine|le foto|foto della|avete consegnato|a che punto|non vedo|consegnat|ordine|defunto|tomba)\b/.test(
            m
        )
    ) {
        return true;
    }

    return false;
}

/** Metodo Luciano: Lei formale, disponibilità, domande di verifica senza codici ordine. */
export function buildPreAcquisitionLucianoReply(firstName?: string | null): string {
    const saluto = firstName ? `Gentile ${firstName}, ` : '';
    return (
        `${saluto}La ringrazio per averci contattato. Sono VERA, l'assistanza di FloreMoria: mi metta pure a disposizione per aiutarLa prima dell'ordine, con calma e attenzione.\n\n` +
        `Mi indichi gentilmente se il fiore servisse per una tomba in cimitero o per un funerale, e in quale città e con quale orario dovrebbe avvenire la consegna, così posso orientarLa nel modo più adatto.\n\n` +
        `In questa fase non serve alcun codice ordine: La guido passo passo.`
    );
}

/**
 * Risposta aperta di cortesia per primo contatto / form contatti.
 * Perché: non riaprire copioni post-consegna su richieste generiche.
 */
export function buildGenericAssistanceOpenReply(firstName?: string | null): string {
    const opening = getItalyOpeningGreeting();
    const raw = (firstName || '').trim();
    const name = raw ? formatPersonName(raw).split(/\s+/)[0] || '' : '';
    if (name) {
        return (
            `${opening} ${name}, come posso aiutarLa? ` +
            `Resto a Sua completa disposizione per qualsiasi informazione o supporto sui nostri servizi.`
        );
    }
    return (
        `${opening}, come posso aiutarLa? ` +
        `Resto a Sua completa disposizione per qualsiasi informazione o supporto sui nostri servizi.`
    );
}

/** Preferisci il nome dal form contatti se presente nel messaggio. */
export function resolveAssistanceDisplayName(
    message: string,
    fallbackFirstName?: string | null
): string | null {
    const fromForm = extractNameFromContactFormPayload(message);
    if (fromForm) {
        const first = fromForm.split(/\s+/)[0];
        return first || fromForm;
    }
    const fb = (fallbackFirstName || '').trim();
    return fb ? formatPersonName(fb).split(/\s+/)[0] || fb : null;
}
