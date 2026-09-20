'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MonumentRecord } from '@/lib/ai/momo/momoMonuments';
import type { MomoVoiceProfile, MomoMusicTrack } from '@/lib/ai/momo/momoVoiceAudio';
import type { MomoRenderPlan, MomoSocialChannel } from '@/lib/ai/momo/momoVideoEngine';

type Catalog = {
    monuments: MonumentRecord[];
    voices: MomoVoiceProfile[];
    music: MomoMusicTrack[];
};

const CHANNELS: Array<{ id: MomoSocialChannel; label: string }> = [
    { id: 'youtube_shorts', label: 'YouTube Shorts' },
    { id: 'instagram_reels', label: 'Instagram Reels' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'facebook', label: 'Facebook' },
];

export default function MomoVideoPanel() {
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [monumentId, setMonumentId] = useState('');
    const [voiceId, setVoiceId] = useState('male-senior');
    const [musicId, setMusicId] = useState('adagio-strings-cc0');
    const [channels, setChannels] = useState<MomoSocialChannel[]>([
        'youtube_shorts',
        'instagram_reels',
    ]);
    const [plan, setPlan] = useState<MomoRenderPlan | null>(null);
    const [loading, setLoading] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [publishNote, setPublishNote] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/dashboard/momo', { cache: 'no-store' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Catalogo MOMO non disponibile');
                if (cancelled) return;
                setCatalog(data);
                if (data.monuments?.[0]?.id) setMonumentId(data.monuments[0].id);
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : 'Errore caricamento MOMO');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const toggleChannel = useCallback((id: MomoSocialChannel) => {
        setChannels((prev) =>
            prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
        );
    }, []);

    const generate = async () => {
        setLoading(true);
        setError(null);
        setPublishNote(null);
        try {
            const res = await fetch('/api/dashboard/momo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generate',
                    monumentId,
                    voiceId,
                    musicId,
                    markReady: true,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Generazione fallita');
            setPlan(data.plan);
        } catch (e) {
            setPlan(null);
            setError(e instanceof Error ? e.message : 'Errore generazione');
        } finally {
            setLoading(false);
        }
    };

    const publish = async () => {
        if (!plan) return;
        setPublishing(true);
        setPublishNote(null);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/momo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'publish', channels }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Pubblicazione fallita');
            setPublishNote(data.note || `Coda: ${data.status}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore publish');
        } finally {
            setPublishing(false);
        }
    };

    return (
        <section className="rounded-2xl border border-stone-200 bg-gradient-to-b from-stone-50 to-white p-5 md:p-6 space-y-5 shadow-sm">
            <header className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                    MOMO · Monumental Video Engine
                </p>
                <h2 className="text-xl font-semibold text-stone-900 tracking-tight">
                    Documentari 9:16 su monumenti reali
                </h2>
                <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
                    Solo cimiteri e personaggi certificati. Zero allucinazioni. Inquadrature a
                    dettaglio floreale (mani). Pubblicazione social solo dopo conferma
                    Amministratore.
                </p>
            </header>

            {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                    {error}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
                <label className="block space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-stone-500">
                        Monumento / personaggio
                    </span>
                    <select
                        value={monumentId}
                        onChange={(e) => setMonumentId(e.target.value)}
                        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-800"
                    >
                        {(catalog?.monuments || []).map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.historicalFigure} — {m.cemetery}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-stone-500">
                        Voce narrante
                    </span>
                    <select
                        value={voiceId}
                        onChange={(e) => setVoiceId(e.target.value)}
                        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-800"
                    >
                        {(catalog?.voices || []).map((v) => (
                            <option key={v.id} value={v.id}>
                                {v.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-stone-500">
                        Musica royalty-free
                    </span>
                    <select
                        value={musicId}
                        onChange={(e) => setMusicId(e.target.value)}
                        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-800"
                    >
                        {(catalog?.music || []).map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.title} ({t.license})
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                    const on = channels.includes(c.id);
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleChannel(c.id)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                                on
                                    ? 'bg-stone-900 text-white border-stone-900'
                                    : 'bg-white text-stone-700 border-stone-200'
                            }`}
                        >
                            {c.label}
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => void generate()}
                    disabled={loading || !monumentId}
                    className="rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
                >
                    {loading ? 'MOMO sta preparando…' : 'Genera piano video MP4 9:16'}
                </button>
                <button
                    type="button"
                    onClick={() => void publish()}
                    disabled={!plan || publishing || channels.length === 0}
                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-800 disabled:opacity-50"
                >
                    {publishing ? 'In coda…' : 'Pubblica (Shorts / Reels / TikTok / FB)'}
                </button>
            </div>

            {publishNote && (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    {publishNote}
                </p>
            )}

            {plan && (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-stone-200 bg-stone-950 aspect-[9/16] max-h-[420px] flex flex-col items-center justify-center text-center p-4">
                        {plan.status === 'RENDERED_READY_FOR_PUBLISH' ? (
                            <>
                                <p className="text-stone-300 text-xs uppercase tracking-widest mb-2">
                                    Anteprima piano · {plan.width}×{plan.height}
                                </p>
                                <p className="text-white text-sm font-medium px-2">
                                    {plan.socialMetadata.title}
                                </p>
                                <p className="text-stone-400 text-xs mt-2">
                                    Output: {plan.videoRelativePath}
                                </p>
                                <p className="text-stone-500 text-[10px] mt-3 max-w-[220px] leading-relaxed">
                                    Worker FFmpeg collega le clip documentarie reali. Qui vedi il
                                    piano pronto per il render fisico.
                                </p>
                            </>
                        ) : (
                            <p className="text-stone-400 text-sm">Piano in preparazione…</p>
                        )}
                    </div>
                    <div className="space-y-3 text-sm text-stone-700">
                        <p>
                            <span className="font-semibold text-stone-900">Durata:</span>{' '}
                            {plan.script.durationSeconds}s · Voce {plan.audio.voice.label} ·{' '}
                            {plan.audio.music.title}
                        </p>
                        <ol className="space-y-2 list-decimal list-inside">
                            {plan.script.blocks.map((b) => (
                                <li key={b.label} className="leading-snug">
                                    <span className="font-medium text-stone-900">
                                        [{b.startSec}–{b.endSec}s]
                                    </span>{' '}
                                    {b.narration}
                                </li>
                            ))}
                        </ol>
                        <p className="text-xs text-stone-500">
                            Hashtag: {plan.socialMetadata.hashtags.join(' ')}
                        </p>
                    </div>
                </div>
            )}
        </section>
    );
}
