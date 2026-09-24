/**
 * POST /api/dashboard/momo
 * Actions:
 * - 'search': ricerca asset storici e contesto enciclopedico (searchMonumentAssets).
 * - 'generate': piano di montaggio e rendering Reel 9:16 con Ken Burns / Footage reale.
 * - 'publish': accodamento pubblicazione social.
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    CERTIFIED_MONUMENTS,
    MOMO_MUSIC_LIBRARY,
    MOMO_NARRATIVE_FORMATS,
    MOMO_VOICE_PROFILES,
    searchMonumentAssets,
    planMomoVideoRenderAsync,
    type MomoNarrativeFormat,
    type MomoSocialChannel,
} from '@/lib/ai/momo';

export const dynamic = 'force-dynamic';

function getLocalDiskRenders() {
    try {
        const rendersDir = path.join(process.cwd(), 'public', 'media', 'social', 'momo', 'renders');
        if (!fs.existsSync(rendersDir)) {
            return [];
        }
        const files = fs.readdirSync(rendersDir);
        const videoFiles = files.filter((f) => /\.(mp4|mov|webm|m4v)$/i.test(f));
        const items = videoFiles.map((filename) => {
            const fullPath = path.join(rendersDir, filename);
            const stat = fs.statSync(fullPath);
            return {
                filename,
                url: `/media/social/momo/renders/${filename}`,
                size: stat.size,
                mtime: stat.mtimeMs,
                createdAt: stat.mtime.toISOString(),
            };
        });
        items.sort((a, b) => b.mtime - a.mtime);
        return items;
    } catch (e) {
        console.warn('[MOMO Renders] Error checking local renders:', e);
        return [];
    }
}

export async function GET(req: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const action = req.nextUrl.searchParams.get('action');
    const diskRenders = getLocalDiskRenders();

    if (action === 'latest_render' || action === 'list_renders' || action === 'renders') {
        return NextResponse.json({
            ok: true,
            renders: diskRenders,
            latest: diskRenders[0] || null,
        });
    }

    return NextResponse.json({
        monuments: CERTIFIED_MONUMENTS,
        formats: MOMO_NARRATIVE_FORMATS,
        voices: MOMO_VOICE_PROFILES,
        music: MOMO_MUSIC_LIBRARY,
        diskRenders,
        latestRender: diskRenders[0] || null,
    });
}

export async function POST(req: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
    }

    const action = String(body.action || 'generate').toLowerCase().trim();

    switch (action) {
        case 'search': {
            const rawQuery = body.query ?? body.locationText ?? body.locationQuery;
            const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
            if (!query) {
                return NextResponse.json(
                    { error: 'Parametro query obbligatorio per la ricerca asset' },
                    { status: 400 }
                );
            }
            try {
                const searchResult = await searchMonumentAssets(query);
                return NextResponse.json({
                    ok: true,
                    assets: searchResult,
                    ...searchResult,
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Errore durante la ricerca degli asset';
                return NextResponse.json({ ok: false, error: msg }, { status: 500 });
            }
        }

        case 'generate': {
            const query = String(body.query || body.locationText || body.monumentId || '').trim();
            const monumentId = String(body.monumentId || '');
            const formatId = body.formatId ? (String(body.formatId) as MomoNarrativeFormat) : undefined;
            const voiceId = body.voiceId && body.voiceId !== 'none' ? String(body.voiceId) : undefined;
            const musicId = String(body.musicId || 'minimal-piano-einaudi-cc0');
            const customHookQuestion = body.customHookQuestion ? String(body.customHookQuestion) : undefined;
            const customImages = Array.isArray(body.customImages) ? (body.customImages as string[]) : undefined;
            const customVideoPath = body.customVideoPath ? String(body.customVideoPath) : undefined;
            const fetchedAssets = body.fetchedAssets as any;
            const autoRender = body.autoRender !== false;

            try {
                const plan = await planMomoVideoRenderAsync(
                    {
                        query: query || monumentId,
                        monumentId,
                        formatId,
                        voiceId,
                        musicId,
                        customHookQuestion,
                        customImages,
                        customVideoPath,
                        fetchedAssets,
                    },
                    autoRender
                );
                return NextResponse.json({ ok: true, plan });
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Errore generazione MOMO';
                const status = msg.includes('STOP') ? 422 : 500;
                return NextResponse.json({ ok: false, error: msg }, { status });
            }
        }

        case 'publish': {
            const channels = Array.isArray(body.channels)
                ? (body.channels as string[])
                : [];
            const allowed: MomoSocialChannel[] = [
                'youtube_shorts',
                'instagram_reels',
                'tiktok',
                'facebook',
            ];
            const selected = channels.filter((c): c is MomoSocialChannel =>
                allowed.includes(c as MomoSocialChannel)
            );
            if (!selected.length) {
                return NextResponse.json(
                    { error: 'Seleziona almeno un canale social' },
                    { status: 400 }
                );
            }
            return NextResponse.json({
                ok: true,
                status: 'QUEUED_PENDING_ADMIN_CONFIRM',
                channels: selected,
                note: 'MOMO non pubblica in autonomia: intent registrato. Completare dispatch con POSTMAN / Amministratore.',
            });
        }

        case 'latest_render':
        case 'list_renders':
        case 'renders': {
            const diskRenders = getLocalDiskRenders();
            return NextResponse.json({
                ok: true,
                renders: diskRenders,
                latest: diskRenders[0] || null,
            });
        }

        default: {
            return NextResponse.json(
                { error: `action sconosciuta: ${action}` },
                { status: 400 }
            );
        }
    }
}
