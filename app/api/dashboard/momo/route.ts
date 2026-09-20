/**
 * POST /api/dashboard/momo/generate — piano script+audio+video MOMO (monumento certificato).
 * POST /api/dashboard/momo/publish — coda pubblicazione (richiede canali + plan; no auto-publish).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    CERTIFIED_MONUMENTS,
    MOMO_MUSIC_LIBRARY,
    MOMO_VOICE_PROFILES,
    markMomoRenderReady,
    planMomoVideoRender,
    type MomoSocialChannel,
} from '@/lib/ai/momo';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    return NextResponse.json({
        monuments: CERTIFIED_MONUMENTS,
        voices: MOMO_VOICE_PROFILES,
        music: MOMO_MUSIC_LIBRARY,
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

    const action = String(body.action || 'generate');

    if (action === 'generate') {
        const monumentId = String(body.monumentId || '');
        const voiceId = body.voiceId && body.voiceId !== 'none' ? String(body.voiceId) : undefined;
        const musicId = String(body.musicId || 'minimal-piano-einaudi-cc0');
        try {
            const plan = planMomoVideoRender({ monumentId, voiceId, musicId });
            // In assenza di worker esterno: piano pronto per review (status planned).
            // markReady solo se esplicitamente richiesto (preview dashboard).
            const ready =
                body.markReady === true ? markMomoRenderReady(plan) : plan;
            return NextResponse.json({ ok: true, plan: ready });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Errore MOMO';
            const status = msg.includes('STOP') ? 422 : 500;
            return NextResponse.json({ error: msg }, { status });
        }
    }

    if (action === 'publish') {
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
        // Pubblicazione reale via POSTMAN/API: coda intent (no auto-fire senza credenziali).
        return NextResponse.json({
            ok: true,
            status: 'QUEUED_PENDING_ADMIN_CONFIRM',
            channels: selected,
            note: 'MOMO non pubblica in autonomia: intent registrato. Completare dispatch con POSTMAN / Amministratore.',
        });
    }

    return NextResponse.json({ error: `action sconosciuta: ${action}` }, { status: 400 });
}
