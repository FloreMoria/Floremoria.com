/**
 * Policy contenuto verbali: niente thread email (POSTMAN), ma ammessa la citazione
 * di assistenza@floremoria.com come contatto operativo nel testo.
 */

const EMAIL_THREAD_BLOCK_PATTERNS: RegExp[] = [
    /BOZZA DI RISPOSTA \(Human-in-the-Loop\)[\s\S]*?(?=\n## |\n---|\n# |\Z)/gi,
    /--- Testo della bozza[\s\S]*?(?=\n---|\n## |\Z)/gi,
    /POSTMAN msgid:[^\n]*/gi,
    /^Email da .+ classificata come .+\.\s*$/gim,
    /^Da:\s*.+<[^>\n]+@[^>\n]+>\s*$/gim,
    /^Oggetto(?:\s+bozza)?:\s*.+$/gim,
    /^Categoria:\s*.+ — .+$/gim,
    /^.*\b(?:mail|e-?mail)\s+(?:ricevut[ae]|inviat[ae])\b.*$/gim,
];

/** True se il testo sembra un log POSTMAN incollato nel verbale, non un verbale vero. */
export function looksLikeEmailCorrespondence(content: string): boolean {
    return (
        /POSTMAN msgid:/i.test(content) ||
        /BOZZA DI RISPOSTA \(Human-in-the-Loop\)/i.test(content) ||
        /Email da .+ classificata come/i.test(content)
    );
}

/** Rimuove blocchi di corrispondenza email; non rimuove assistenza@floremoria.com citato come contatto. */
export function stripEmailCorrespondenceFromVerbale(content: string): string {
    let out = content;
    for (const pattern of EMAIL_THREAD_BLOCK_PATTERNS) {
        out = out.replace(pattern, '');
    }
    return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Applica policy prima di scrivere verbale in repo o floremoria_logs. */
export function applyVerbaleContentPolicy(content: string): string {
    return stripEmailCorrespondenceFromVerbale(content);
}
