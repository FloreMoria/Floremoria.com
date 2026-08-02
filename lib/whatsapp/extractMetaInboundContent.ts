/**
 * Estrae testo/media leggibili da un messaggio webhook Meta Cloud API.
 * Perché: foto iOS/Android spesso arrivano come `document` o `unsupported`;
 * il vecchio testo "Tipo sconosciuto…OTP" finiva in chat e confondeva i fioristi.
 */

export type MetaInboundMediaMessage = {
    type?: string;
    text?: { body?: string };
    image?: { caption?: string; id?: string; mime_type?: string; sha256?: string };
    audio?: { id?: string; mime_type?: string };
    document?: {
        caption?: string;
        id?: string;
        filename?: string;
        mime_type?: string;
        sha256?: string;
    };
    video?: { caption?: string; id?: string; mime_type?: string };
    sticker?: { id?: string; animated?: boolean; mime_type?: string };
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
    /** true = non merita risposta VERA (reaction, system…) */
    silenceVera: boolean;
    /**
     * true = allegato non leggibile / tipo non supportato senza media recuperabile.
     * Per i fioristi: risposta umanizzata (niente testo tecnico OTP).
     */
    unsupportedMedia?: boolean;
    /** Suggerimento mime dall'header Meta (document/image). */
    mimeHint?: string;
};

/** Messaggio cortese per fiorista quando il file non è una foto WhatsApp leggibile. */
export const FLORIST_UNSUPPORTED_MEDIA_REPLY =
    '📸 Non sono riuscita ad aprire questo file. Per favore, inviami la foto scattandola o selezionandola direttamente dalla galleria come normale immagine WhatsApp!';

function metaMediaProxyUrl(mediaId: string): string {
    return `/api/dashboard/whatsapp/media/${mediaId}`;
}

function looksLikeImageFile(params: {
    mimeType?: string | null;
    filename?: string | null;
}): boolean {
    const mime = (params.mimeType || '').toLowerCase();
    if (mime.startsWith('image/') || mime.includes('webp')) return true;
    const name = (params.filename || '').toLowerCase();
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(name);
}

/** Recupera un media id anche se Meta ha messo type=unsupported ma lascia i nodi media. */
function salvageMediaId(msg: MetaInboundMediaMessage): string | undefined {
    return (
        msg.image?.id?.trim() ||
        msg.document?.id?.trim() ||
        msg.video?.id?.trim() ||
        msg.sticker?.id?.trim() ||
        msg.audio?.id?.trim() ||
        undefined
    );
}

function salvageCaption(msg: MetaInboundMediaMessage): string {
    return (
        msg.image?.caption?.trim() ||
        msg.document?.caption?.trim() ||
        msg.video?.caption?.trim() ||
        ''
    );
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
 * Non espone mai all'utente testi tecnici tipo "Tipo sconosciuto / OTP".
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
                mimeHint: msg.image?.mime_type,
            };

        case 'audio':
            return {
                text: 'Messaggio vocale',
                mediaUrl: msg.audio?.id ? metaMediaProxyUrl(msg.audio.id) : undefined,
                silenceVera: false,
                mimeHint: msg.audio?.mime_type,
            };

        case 'document': {
            const caption = msg.document?.caption?.trim();
            const filename = msg.document?.filename?.trim();
            const mimeHint = msg.document?.mime_type;
            const mediaUrl = msg.document?.id ? metaMediaProxyUrl(msg.document.id) : undefined;
            const asImage = looksLikeImageFile({ mimeType: mimeHint, filename });

            // Foto inviata come "documento" (tipico iOS/Android): trattala come prova posa.
            if (asImage && mediaUrl) {
                return {
                    text: caption || '',
                    mediaUrl,
                    silenceVera: false,
                    mimeHint: mimeHint || 'image/*',
                };
            }

            return {
                text: caption || (filename ? `Documento: ${filename}` : 'Documento'),
                mediaUrl,
                silenceVera: false,
                mimeHint,
                // Documento non-immagine: guida il fiorista a inviare foto dalla galleria.
                unsupportedMedia: Boolean(mediaUrl) && !asImage,
            };
        }

        case 'video':
            return {
                text: msg.video?.caption?.trim() ?? 'Video',
                mediaUrl: msg.video?.id ? metaMediaProxyUrl(msg.video.id) : undefined,
                silenceVera: false,
                mimeHint: msg.video?.mime_type,
                // Video non è prova foto standard → guida fiorista se serve.
                unsupportedMedia: true,
            };

        case 'sticker':
            return {
                text: 'Sticker',
                mediaUrl: msg.sticker?.id ? metaMediaProxyUrl(msg.sticker.id) : undefined,
                silenceVera: true,
                mimeHint: msg.sticker?.mime_type,
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

        case 'unsupported': {
            // Se Meta lascia comunque un nodo media, salvalo (foto mascherata da unsupported).
            const mediaId = salvageMediaId(msg);
            if (mediaId) {
                const mimeHint =
                    msg.image?.mime_type ||
                    msg.document?.mime_type ||
                    msg.video?.mime_type ||
                    msg.sticker?.mime_type;
                const asImage = looksLikeImageFile({
                    mimeType: mimeHint,
                    filename: msg.document?.filename,
                });
                return {
                    text: salvageCaption(msg),
                    mediaUrl: metaMediaProxyUrl(mediaId),
                    silenceVera: false,
                    mimeHint,
                    unsupportedMedia: !asImage,
                };
            }
            // Nessun media recuperabile: niente testo OTP tecnico in chat.
            return {
                text: '',
                silenceVera: false,
                unsupportedMedia: true,
            };
        }

        default: {
            if (msg.reaction) {
                const emoji = msg.reaction.emoji?.trim();
                return {
                    text: emoji ? `Reazione: ${emoji}` : 'Reazione rimossa',
                    silenceVera: true,
                };
            }

            const mediaId = salvageMediaId(msg);
            if (mediaId) {
                const mimeHint =
                    msg.image?.mime_type ||
                    msg.document?.mime_type ||
                    msg.video?.mime_type;
                const asImage = looksLikeImageFile({
                    mimeType: mimeHint,
                    filename: msg.document?.filename,
                });
                return {
                    text: salvageCaption(msg) || (type ? `Messaggio WhatsApp (${type})` : ''),
                    mediaUrl: metaMediaProxyUrl(mediaId),
                    silenceVera: false,
                    mimeHint,
                    unsupportedMedia: !asImage,
                };
            }

            if (msg.unsupported || (msg.errors && msg.errors.length > 0) || type === 'unknown') {
                return {
                    text: '',
                    silenceVera: false,
                    unsupportedMedia: true,
                };
            }

            if (type) {
                return { text: `Messaggio WhatsApp (${type})`, silenceVera: false };
            }
            return { text: '', silenceVera: false };
        }
    }
}
