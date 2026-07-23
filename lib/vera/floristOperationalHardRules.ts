/**
 * Hard rules dati operativi fiorista (P0 Martina/Carlo).
 * Perché: listino/indirizzo incompleti non sono “certezza al 100%” — escalate, non inventare.
 */
import type { VeraCallerContext } from '@/lib/vera/callerContext';

export type FloristDataRequestKind = 'compensation' | 'address' | 'ticket';

const COMPENSATION_ASK =
    /compenso|budget|€|euro|pagat|pagamento|quanto\s+(mi\s+)?(dai|date|spetta|prende)|aveva\s+(indicato|detto)|cambiato\s+budget|sbagliato/i;

const ADDRESS_ASK =
    /indirizzo|via\b|dove\s+(è|si\s+trova)|dove\s+devo|localit[aà]|chiesa|coordinate|posizione\s+(esatta|precisa)|come\s+arrivo/i;

const TICKET_ASK =
    /testo\s+(del\s+)?bigliett|bigliettino|nastro|cosa\s+(scrivere|mettere)|messaggio\s+(sul|del)/i;

export function detectFloristOperationalDataRequest(message: string): FloristDataRequestKind | null {
    const m = message || '';
    if (COMPENSATION_ASK.test(m)) return 'compensation';
    if (TICKET_ASK.test(m)) return 'ticket';
    if (ADDRESS_ASK.test(m)) return 'address';
    return null;
}

function looksLikeCompleteStreetAddress(value: string | null | undefined): boolean {
    const v = (value || '').trim();
    if (v.length < 8) return false;
    // Serve un pezzo “via/viale/piazza/…” o un civico numerico — non solo “Presso Cremazione, Città”.
    if (/via\s|viale\s|piazza\s|corso\s|strada\s|vicolo\s|largo\s/i.test(v)) return true;
    if (/\d{1,4}[a-z]?/i.test(v) && v.length >= 12) return true;
    return false;
}

/**
 * Certezza operativa: solo se il campo è pieno e usabile.
 * Compenso: mai “100% certo” da sola AI su contestazione/domanda — sempre escalate (Regola Aurea).
 */
export function isFloristOperationalDataCertain(
    kind: FloristDataRequestKind,
    ctx: VeraCallerContext
): boolean {
    if (kind === 'compensation') {
        // Listino può divergere dall'accordo umano (caso Martina 20€ vs 30€).
        return false;
    }
    if (kind === 'ticket') {
        return Boolean(ctx.ticketMessage?.trim());
    }
    if (kind === 'address') {
        const structured = ctx.structuredDeliveryAddress?.trim();
        if (looksLikeCompleteStreetAddress(structured)) return true;
        if (looksLikeCompleteStreetAddress(ctx.gravePosition)) return true;
        return false;
    }
    return false;
}

export function buildFloristCertainDataReply(
    kind: FloristDataRequestKind,
    ctx: VeraCallerContext
): string {
    if (kind === 'ticket' && ctx.ticketMessage) {
        return `Il testo del biglietto/nastro da riportare è esattamente:\n"${ctx.ticketMessage.trim()}"`;
    }
    if (kind === 'address') {
        const addr =
            ctx.structuredDeliveryAddress?.trim() ||
            [ctx.gravePosition, ctx.deliveryLocation].filter(Boolean).join(' — ');
        return `Indicazioni di consegna:\n${addr}`;
    }
    return 'Ricevuto, ti aggiorno subito.';
}

export function buildFloristUncertainEscalateReply(kind: FloristDataRequestKind): string {
    if (kind === 'compensation') {
        return (
            'Ricevuto, grazie per la verifica. Non confermo cifre finché lo Staff non valida l’accordo: ' +
            'li avviso subito e ti riscrivono qui con il compenso corretto.'
        );
    }
    if (kind === 'ticket') {
        return (
            'Ricevuto. Il testo del biglietto non risulta completo a sistema: avviso subito lo Staff ' +
            'e ti mando il testo esatto appena disponibile.'
        );
    }
    return (
        'Ricevuto. L’indirizzo/indicazioni non sono complete al 100% a sistema: avviso subito lo Staff ' +
        'e ti giro i dettagli precisi appena pronti. Intanto non procedere a tentativi a vuoto.'
    );
}
