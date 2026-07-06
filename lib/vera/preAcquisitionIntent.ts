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
    /mi servono informazioni/,
    /avrei bisogno di informazioni/,
    /non ho ancora ordinato/,
    /devo ancora ordinare/,
    /come funziona/,
    /quanto costa/,
    /listino|prezz/i,
    /vorrei mandare fiori/,
    /vorrei inviare fiori/,
    /informazioni su/,
    /prima dell ordine/,
];

/** Messaggio con intento informativo / pre-ordine — non va collegato a ordini storici completati. */
export function isPreAcquisitionIntent(message: string): boolean {
    const m = normalizeForMatch(message);
    if (!m) return false;
    return PRE_ACQUISITION_PATTERNS.some((pattern) => pattern.test(m));
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
