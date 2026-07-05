/** Estrae il nome di battesimo (prima parola) da nome completo o ragione sociale. */
export function extractFirstName(fullName: string): string {
    const trimmed = fullName.trim().replace(/^gentile\s+/i, '');
    if (!trimmed) return '';
    const [first] = trimmed.split(/\s+/);
    return first ?? trimmed;
}

/**
 * Valore per {{1}} sul template Meta approvato (inizia con "{{1}},").
 * Il saluto "Gentile" va nel parametro, non nel testo fisso del template.
 */
export function formatGentileSalutation(recipientFirstName: string): string {
    const firstName = extractFirstName(recipientFirstName);
    if (!firstName) return '';
    return `Gentile ${firstName}`;
}

/** Normalizza il codice ordine rimuovendo prefissi ridondanti (es. "Ordine FF-..."). */
export function normalizeOrderCode(raw: string): string {
    return raw
        .trim()
        .replace(/^(ordine|order|rif\.?|riferimento)\s*/i, '')
        .replace(/^[-–—:\s]+/, '')
        .trim();
}

export interface ProactiveTemplateParams {
    /** Nome di battesimo (campo UI / validazione). */
    recipientFirstName: string;
    /** Valore inviato a Meta come {{1}} — es. "Gentile Carlo". */
    salutationParam: string;
    orderCode: string;
    staffNotes: string;
}

export function resolveProactiveTemplateParams(input: {
    recipientFirstName?: string;
    orderCode?: string;
    staffNotes?: string;
    templateParams?: string[];
}): ProactiveTemplateParams {
    const rawFirst =
        input.recipientFirstName ??
        (input.templateParams?.[0]?.replace(/^gentile\s+/i, '') ?? '');
    const recipientFirstName = extractFirstName(rawFirst);
    return {
        recipientFirstName,
        salutationParam: formatGentileSalutation(recipientFirstName),
        orderCode: normalizeOrderCode(input.orderCode ?? input.templateParams?.[1] ?? ''),
        staffNotes: (input.staffNotes ?? input.templateParams?.[2] ?? '').trim(),
    };
}
