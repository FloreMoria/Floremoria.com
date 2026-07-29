/**
 * Estrae testo/media leggibili da un messaggio webhook Meta Cloud API.
 * Perché: tipi come reaction/unsupported finivano in chat come "[unsupported]" / "[reaction]"
 * senza emoji né contesto utile allo staff.
 */

export type MetaInboundMediaMessage = {
    type?: string;
    text?: { body?: string };
    image?: { caption?: string; id?: string };
    audio?: { id?: string };
    document?: { caption?: string; id?: string; filename?: string };
    video?: { caption?: string; id?: string };
    sticker?: { id?: string; animated?: boolean };
    interactive?: {
        button_reply?: { title?: string; id?: string };
        list_reply?: { title?: string; id?: string; description?: string };
        nfm_reply?: { response_json?: string; body?: string; name?: string };
    };
    button?: { text?: string; payload?: string };
    reaction?: { message_id?: string; emoji?: string };
    location?: {
        latitude?: number;
        longitude?: number;
        name?: string;
        address?: string;
    };
    contacts?: Array<{
        name?: { formatted_name?: string; first_name?: string };
        phones?: Array<{ phone?: string; type?: string }>;
        emails?: Array<{ email?: string }>;
    }>;
    order?: { catalog_id?: string; product_items?: unknown[] };
    system?: { body?: string; type?: string };
    unsupported?: { type?: string };
    errors?: Array<{
        code?: number;
        title?: string;
        message?: string;
        error_data?: { details?: string };
    }>;
};

export type ExtractedMetaInbound = {
    text: string;
    mediaUrl?: string;
    /** true = non merita risposta VERA (reaction, unsupported, system…) */
    silenceVera: boolean;
};

function metaMediaProxyUrl(mediaId: string): string {
    return `/api/dashboard/whatsapp/media/${mediaId}`;
}

const UNSUPPORTED_TYPE_LABELS: Record<string, string> = {
    reaction: 'Reazione WhatsApp',
    poll_creation: 'Sondaggio WhatsApp',
    poll_update: 'Aggiornamento sondaggio WhatsApp',
    gif: 'GIF WhatsApp',
    group_invite: 'Invito a gruppo WhatsApp',
    interactive: 'Messaggio interattivo',
    button: 'Pulsante WhatsApp',
    location: 'Posizione',
    order: 'Ordine catalogo',
    product: 'Prodotto catalogo',
    edit: 'Messaggio modificato',
    media_placeholder: 'Anteprima media',
    keep_in_chat: 'Messaggio fissato in chat',
    pin: 'Messaggio fissato',
    hsm: 'Template / messaggio di sistema',
    list: 'Lista interattiva',
    link_preview: 'Anteprima link',
    contacts: 'Contatto condiviso',
    sticker: 'Sticker',
    ephemeral: 'Messaggio monouso / effimero',
    view_once: 'Messaggio monouso',
    unknown: 'Tipo sconosciuto',
};

function formatUnsupported(msg: MetaInboundMediaMessage): string {
    const subtype = (msg.unsupported?.type || '').trim().toLowerCase();
    const label =
        (subtype && UNSUPPORTED_TYPE_LABELS[subtype]) ||
        (subtype ? `Messaggio «${subtype}»` : null);

    // OTP / auth da PayPal, Stripe, banche: Meta espone type=unsupported e non passa il codice.
    const details = msg.errors?.[0]?.error_data?.details || msg.errors?.[0]?.title || '';
    const looksLikeProtected =
        !subtype ||
        /not supported|unknown|hsm|ephemeral|view_once/i.test(`${subtype} ${details}`);

    if (label && subtype === 'reaction') {
        return 'Reazione WhatsApp (Meta non ha inviato l’emoji via API)';
    }

    if (label && !looksLikeProtected) {
        return label;
    }

    if (label) {
        return `${label}. Se era un codice OTP o un contenuto protetto, Meta non lo espone alla Business API: chiedi di copiarlo e inviarlo come testo.`;
    }

    return 'Messaggio non supportato da Meta Business API (spesso OTP/codici o contenuti protetti). Chiedi di inviarlo come testo.';
}

function formatLocation(loc: NonNullable<MetaInboundMediaMessage['location']>): string {
    const name = loc.name?.trim();
    const address = loc.address?.trim();
    const coords =
        typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
            ? `${loc.latitude}, ${loc.longitude}`
            : '';
    const parts = [name, address, coords].filter(Boolean);
    return parts.length ? `Posizione: ${parts.join(' · ')}` : 'Posizione condivisa';
}

function formatContacts(contacts: NonNullable<MetaInboundMediaMessage['contacts']>): string {
    const lines = contacts.map((c) => {
        const name = c.name?.formatted_name || c.name?.first_name || 'Contatto';
        const phone = c.phones?.[0]?.phone?.trim();
        const email = c.emails?.[0]?.email?.trim();
        return [name, phone, email].filter(Boolean).join(' · ');
    });
    return lines.length ? `Contatto: ${lines.join('; ')}` : 'Contatto condiviso';
}

/**
 * Converte un messaggio Meta webhook in testo/media per la dashboard Communications.
 */
export function extractMetaInboundContent(msg: MetaInboundMediaMessage): ExtractedMetaInbound {
    const type = (msg.type || '').trim().toLowerCase();

    switch (type) {
        case 'text':
            return { text: msg.text?.body?.trim() ?? '', silenceVera: false };

        case 'image':
            return {
                text: msg.image?.caption?.trim() ?? '',
                mediaUrl: msg.image?.id ? metaMediaProxyUrl(msg.image.id) : undefined,
                silenceVera: false,
            };

        case 'audio':
            return {
                text: 'Messaggio vocale',
                mediaUrl: msg.audio?.id ? metaMediaProxyUrl(msg.audio.id) : undefined,
                silenceVera: false,
            };

        case 'document': {
            const caption = msg.document?.caption?.trim();
            const filename = msg.document?.filename?.trim();
            return {
                text: caption || (filename ? `Documento: ${filename}` : 'Documento'),
                mediaUrl: msg.document?.id ? metaMediaProxyUrl(msg.document.id) : undefined,
                silenceVera: false,
            };
        }

        case 'video':
            return {
                text: msg.video?.caption?.trim() ?? 'Video',
                mediaUrl: msg.video?.id ? metaMediaProxyUrl(msg.video.id) : undefined,
                silenceVera: false,
            };

        case 'sticker':
            return {
                text: 'Sticker',
                mediaUrl: msg.sticker?.id ? metaMediaProxyUrl(msg.sticker.id) : undefined,
                silenceVera: true,
            };

        case 'interactive': {
            const nfmBody = msg.interactive?.nfm_reply?.body?.trim();
            const nfmJson = msg.interactive?.nfm_reply?.response_json?.trim();
            const reply =
                msg.interactive?.button_reply?.title?.trim() ||
                msg.interactive?.list_reply?.title?.trim() ||
                nfmBody ||
                (nfmJson ? `Risposta modulo: ${nfmJson.slice(0, 500)}` : '');
            return { text: reply || 'Risposta interattiva', silenceVera: false };
        }

        case 'button':
            return {
                text: msg.button?.text?.trim() || msg.button?.payload?.trim() || 'Pulsante',
                silenceVera: false,
            };

        case 'reaction': {
            const emoji = msg.reaction?.emoji?.trim();
            if (emoji) {
                return { text: `Reazione: ${emoji}`, silenceVera: true };
            }
            return { text: 'Reazione rimossa', silenceVera: true };
        }

        case 'location':
            return {
                text: msg.location ? formatLocation(msg.location) : 'Posizione condivisa',
                silenceVera: false,
            };

        case 'contacts':
            return {
                text: msg.contacts?.length ? formatContacts(msg.contacts) : 'Contatto condiviso',
                silenceVera: false,
            };

        case 'order':
            return {
                text: `Ordine catalogo${msg.order?.catalog_id ? ` (${msg.order.catalog_id})` : ''}`,
                silenceVera: false,
            };

        case 'system':
            return {
                text: msg.system?.body?.trim() || `Messaggio di sistema${msg.system?.type ? `: ${msg.system.type}` : ''}`,
                silenceVera: true,
            };

        case 'unsupported':
            return { text: formatUnsupported(msg), silenceVera: true };

        default: {
            // Payload anomalo: reaction senza type, o type nuovo.
            if (msg.reaction) {
                const emoji = msg.reaction.emoji?.trim();
                return {
                    text: emoji ? `Reazione: ${emoji}` : 'Reazione rimossa',
                    silenceVera: true,
                };
            }
            if (msg.unsupported || (msg.errors && msg.errors.length > 0)) {
                return { text: formatUnsupported(msg), silenceVera: true };
            }
            if (type) {
                return { text: `Messaggio WhatsApp (${type})`, silenceVera: false };
            }
            return { text: '', silenceVera: false };
        }
    }
}
