/** Estrae il nome di battesimo (prima parola) da nome completo o ragione sociale. */
export function extractFirstName(fullName: string): string {
    const trimmed = fullName.trim();
    if (!trimmed) return '';
    const [first] = trimmed.split(/\s+/);
    return first ?? trimmed;
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
    recipientFirstName: string;
    orderCode: string;
    staffNotes: string;
}

export function resolveProactiveTemplateParams(input: {
    recipientFirstName?: string;
    orderCode?: string;
    staffNotes?: string;
    templateParams?: string[];
}): ProactiveTemplateParams {
    return {
        recipientFirstName: extractFirstName(input.recipientFirstName ?? input.templateParams?.[0] ?? ''),
        orderCode: normalizeOrderCode(input.orderCode ?? input.templateParams?.[1] ?? ''),
        staffNotes: (input.staffNotes ?? input.templateParams?.[2] ?? '').trim(),
    };
}
