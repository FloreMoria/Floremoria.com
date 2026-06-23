/**
 * Testo WhatsApp per il fiorista: link mini-app + raccomandazione foto in loco.
 */
export const FLORIST_DELIVERY_PHOTO_INSTRUCTION =
    'Scatta le foto ai fiori mentre sei davanti alla tomba o alla bara, poi caricale dalla mini-app.';

export interface FloristDeliveryMessageInput {
    codice_ordine?: string | null;
    nome_defunto?: string | null;
    cimitero?: string | null;
    comune_cimitero?: string | null;
    posizione_tomba?: string | null;
    data_consegna?: string | null;
    deliveryUrl: string;
}

export function buildFloristDeliveryWhatsAppText(input: FloristDeliveryMessageInput): string {
    const codice = input.codice_ordine?.trim() || '—';
    const defunto = input.nome_defunto?.trim() || '—';
    const cimitero = [input.cimitero?.trim(), input.comune_cimitero?.trim()]
        .filter(Boolean)
        .join(' / ') || 'Non specificato';
    const tomba = input.posizione_tomba?.trim() || 'Non specificata';
    const data = input.data_consegna?.trim() || 'Da programmare';
    const url = input.deliveryUrl.trim();

    return (
        `Nuovo incarico FloreMoria — ordine ${codice} per ${defunto}.\n` +
        `Cimitero: ${cimitero}. Tomba: ${tomba}. Consegna: ${data}.\n\n` +
        `📸 ${FLORIST_DELIVERY_PHOTO_INSTRUCTION}\n\n` +
        `Apri la mini-app:\n${url}`
    );
}
