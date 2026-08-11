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

import { createPin } from '@/lib/social/pinterest';

/**
 * Crea un Pin su board_id (env PINTEREST_BOARD_ID o override).
 */
export async function createPinterestPin(
    input: CreatePinterestPinInput
): Promise<CreatePinterestPinResult> {
    return createPin(input);
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
