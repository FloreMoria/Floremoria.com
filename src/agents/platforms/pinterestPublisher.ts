/**
 * Publisher Pinterest API v5 — usato dal Pinterest Agent / POSTMAN.
 * Token sempre via pinterestTokenService (continuous refresh).
 */
import {
    PINTEREST_API_BASE,
    getPinterestDefaultBoardId,
    parsePinterestApiError,
} from '@/lib/pinterest/oauth';
import { getValidPinterestAccessToken } from '@/src/agents/platforms/pinterestTokenService';

export type PinterestBoard = {
    id: string;
    name: string;
    description?: string | null;
    privacy?: string | null;
};

export type CreatePinterestPinInput = {
    title: string;
    description: string;
    imageUrl: string;
    link?: string | null;
    boardId?: string | null;
    altText?: string | null;
};

export type CreatePinterestPinResult = {
    success: boolean;
    simulated?: boolean;
    pinId?: string;
    error?: string;
};

async function pinterestFetch<T>(
    path: string,
    accessToken: string,
    init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
    const res = await fetch(`${PINTEREST_API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(init?.headers || {}),
        },
        cache: 'no-store',
    });

    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok) {
        return {
            ok: false,
            status: res.status,
            data,
            error: parsePinterestApiError(data) || `HTTP ${res.status}`,
        };
    }
    return { ok: true, status: res.status, data, error: null };
}

/** Elenco bacheche dell’account collegato. */
export async function listPinterestBoards(): Promise<{
    boards: PinterestBoard[];
    error?: string;
}> {
    const accessToken = await getValidPinterestAccessToken();
    if (!accessToken) {
        return { boards: [], error: 'Pinterest non collegato (manca access token).' };
    }

    const result = await pinterestFetch<{ items?: Array<Record<string, unknown>> }>(
        '/boards?page_size=50',
        accessToken
    );

    if (!result.ok || !result.data) {
        return { boards: [], error: result.error || 'Impossibile leggere le bacheche.' };
    }

    const boards: PinterestBoard[] = (result.data.items || []).map((item) => ({
        id: String(item.id || ''),
        name: String(item.name || ''),
        description: typeof item.description === 'string' ? item.description : null,
        privacy: typeof item.privacy === 'string' ? item.privacy : null,
    })).filter((b) => b.id);

    return { boards };
}

/**
 * Crea un Pin su board_id (env PINTEREST_BOARD_ID o override).
 */
export async function createPinterestPin(
    input: CreatePinterestPinInput
): Promise<CreatePinterestPinResult> {
    const accessToken = await getValidPinterestAccessToken();
    if (!accessToken) {
        console.warn('[Pinterest] Token assente — pubblicazione simulata.');
        return {
            success: true,
            simulated: true,
            pinId: `simulated-pinterest-${Date.now()}`,
        };
    }

    const boardId = input.boardId?.trim() || getPinterestDefaultBoardId();
    if (!boardId) {
        return {
            success: false,
            error: 'PINTEREST_BOARD_ID non configurato e boardId non passato.',
        };
    }

    if (!input.imageUrl?.trim()) {
        return { success: false, error: 'imageUrl obbligatorio per creare un Pin.' };
    }

    const body = {
        board_id: boardId,
        title: input.title.slice(0, 100),
        description: input.description.slice(0, 800),
        link: input.link?.trim() || 'https://www.floremoria.com',
        alt_text: input.altText?.slice(0, 500) || input.title.slice(0, 500),
        media_source: {
            source_type: 'image_url',
            url: input.imageUrl.trim(),
        },
    };

    const result = await pinterestFetch<{ id?: string }>('/pins', accessToken, {
        method: 'POST',
        body: JSON.stringify(body),
    });

    if (!result.ok) {
        return { success: false, error: result.error || 'Creazione Pin fallita.' };
    }

    const pinId = result.data?.id ? String(result.data.id) : undefined;
    console.log(`[Pinterest] Pin creato: ${pinId || '(id assente)'}`);
    return { success: true, pinId };
}

/** Pubblica una campagna marketing come Pin (Pinterest Agent). */
export async function publishCampaignToPinterest(input: {
    campaignId: string;
    copy: string;
    hashtags: string[];
    imageUrl: string;
    link?: string | null;
    boardId?: string | null;
}): Promise<CreatePinterestPinResult> {
    const hashtagLine = (input.hashtags || [])
        .map((t) => (t.startsWith('#') ? t : `#${t}`))
        .slice(0, 5)
        .join(' ');

    const title = input.copy.replace(/\s+/g, ' ').trim().slice(0, 100) || 'FloreMoria';
    const description = [input.copy.trim(), hashtagLine].filter(Boolean).join('\n\n').slice(0, 800);

    return createPinterestPin({
        title,
        description,
        imageUrl: input.imageUrl,
        link: input.link || 'https://www.floremoria.com',
        boardId: input.boardId,
        altText: title,
    });
}
