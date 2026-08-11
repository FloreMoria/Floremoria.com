import {
    PINTEREST_API_BASE,
    getPinterestDefaultBoardId,
    parsePinterestApiError,
} from '@/lib/pinterest/oauth';
import { getValidPinterestAccessToken } from '@/src/agents/platforms/pinterestTokenService';

export interface CreatePinMediaSource {
    source_type: 'image_url';
    url: string;
}

export interface CreatePinParams {
    board_id?: string | null;
    boardId?: string | null;
    title: string;
    description: string;
    link?: string | null;
    media_source?: CreatePinMediaSource;
    imageUrl?: string | null;
    image_url?: string | null;
    altText?: string | null;
    alt_text?: string | null;
}

export interface CreatePinResult {
    success: boolean;
    simulated?: boolean;
    pinId?: string;
    error?: string;
    data?: unknown;
}

/**
 * Client Pinterest API v5 — Pubblicazione Pin (createPin).
 * Endpoint ufficiale: POST https://api.pinterest.com/v5/pins
 * Esegue automaticamente il check sul token ed il refresh entro 24h prima della pubblicazione.
 */
export async function createPin(input: CreatePinParams): Promise<CreatePinResult> {
    const accessToken = await getValidPinterestAccessToken();
    if (!accessToken) {
        console.warn('[Pinterest V5 Client] Access token assente o non configurato — pubblicazione simulata.');
        return {
            success: true,
            simulated: true,
            pinId: `simulated-pin-${Date.now()}`,
        };
    }

    const boardId = (input.board_id || input.boardId || getPinterestDefaultBoardId())?.trim();
    if (!boardId) {
        return {
            success: false,
            error: 'board_id obbligatorio per creare un Pin (mancante in input e env PINTEREST_BOARD_ID).',
        };
    }

    const imageUrl = (input.media_source?.url || input.imageUrl || input.image_url)?.trim();
    if (!imageUrl) {
        return {
            success: false,
            error: 'URL immagine obbligatorio (media_source.url / imageUrl).',
        };
    }

    const title = input.title?.trim() || 'FloreMoria';
    const description = input.description?.trim() || title;
    const link = input.link?.trim() || 'https://www.floremoria.com';
    const altText = input.altText?.trim() || input.alt_text?.trim() || title;

    const payload = {
        board_id: boardId,
        title: title.slice(0, 100),
        description: description.slice(0, 800),
        link,
        alt_text: altText.slice(0, 500),
        media_source: {
            source_type: 'image_url' as const,
            url: imageUrl,
        },
    };

    try {
        const response = await fetch(`${PINTEREST_API_BASE}/pins`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(payload),
            cache: 'no-store',
        });

        const resData = (await response.json().catch(() => null)) as Record<string, unknown> | null;

        if (!response.ok) {
            const errMsg = parsePinterestApiError(resData) || `Pinterest API POST /pins failed (${response.status})`;
            console.error('[Pinterest V5 Client] Errore API:', { status: response.status, error: errMsg, payload });
            return {
                success: false,
                error: errMsg,
                data: resData,
            };
        }

        const pinId = resData?.id ? String(resData.id) : undefined;
        console.log(`[Pinterest V5 Client] Pin creato con successo su board ${boardId} — pinId: ${pinId || 'n/a'}`);

        return {
            success: true,
            pinId,
            data: resData,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Pinterest V5 Client] Eccezione fetch /pins:', msg);
        return {
            success: false,
            error: msg,
        };
    }
}

export const createPinterestPin = createPin;
