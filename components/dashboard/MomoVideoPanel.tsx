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
                const firstId = data.monuments?.[0]?.id || 'alessandro-volta-camnago';
                setMonumentId(firstId);

                // Auto-carica l'anteprima per Alessandro Volta
                const planRes = await fetch('/api/dashboard/momo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generate',
                        monumentId: firstId,
                        voiceId: 'male-senior',
                        musicId: 'adagio-strings-cc0',
                        markReady: true,
                    }),
                });
                const planData = await planRes.json();
                if (planRes.ok && planData.plan && !cancelled) {
                    setPlan(planData.plan);
                }
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
                    className="rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 hover:bg-stone-800 transition-colors"
                >
                    {loading ? 'MOMO sta renderizzando…' : 'Rigenera video MP4 9:16'}
                </button>
                <button
                    type="button"
                    onClick={() => void publish()}
                    disabled={!plan || publishing || channels.length === 0}
                    className="rounded-xl border border-rose-500 bg-rose-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 hover:bg-rose-700 transition-colors shadow-sm"
                >
                    {publishing ? 'In coda…' : 'Pubblica su Instagram Reels & Social'}
                </button>
                {plan?.videoRelativePath && (
                    <a
                        href={plan.videoRelativePath}
                        download="test_volta_camnago_reel.mp4"
                        className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-800 hover:bg-stone-50 transition-colors inline-flex items-center gap-1.5"
                    >
                        📥 Scarica MP4
                    </a>
                )}
                {plan?.srtRelativePath && (
                    <a
                        href={plan.srtRelativePath}
                        download="test_volta_camnago_reel.srt"
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-800 hover:bg-stone-50 transition-colors inline-flex items-center gap-1.5"
                    >
                        📄 Sottotitoli .SRT
                    </a>
                )}
            </div>

            {publishNote && (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-medium">
                    ✅ {publishNote}
                </p>
            )}

            {plan && (
                <div className="grid gap-6 md:grid-cols-2 pt-2">
                    <div className="rounded-2xl border border-stone-800 bg-black aspect-[9/16] max-h-[520px] flex flex-col items-center justify-center text-center overflow-hidden shadow-lg relative">
                        {plan.videoRelativePath ? (
                            <video
                                key={plan.videoRelativePath}
                                src={plan.videoRelativePath}
                                controls
                                autoPlay
                                muted
                                playsInline
                                loop
                                className="w-full h-full object-contain"
                            />
                        ) : plan.status === 'RENDERED_READY_FOR_PUBLISH' ? (
                            <div className="p-4 space-y-2">
                                <p className="text-stone-300 text-xs uppercase tracking-widest">
                                    Anteprima video · {plan.width}×{plan.height}
                                </p>
                                <p className="text-white text-sm font-medium px-2">
                                    {plan.socialMetadata.title}
                                </p>
                                <p className="text-stone-400 text-xs mt-2">
                                    Output: {plan.videoRelativePath}
                                </p>
                            </div>
                        ) : (
                            <p className="text-stone-400 text-sm">Piano in preparazione…</p>
                        )}
                    </div>
                    <div className="space-y-4 text-sm text-stone-700 flex flex-col justify-between">
                        <div className="space-y-3">
                            <div className="bg-stone-100 rounded-xl p-3 border border-stone-200">
                                <p className="font-semibold text-stone-900 text-sm">
                                    {plan.socialMetadata.title}
                                </p>
                                <p className="text-xs text-stone-600 mt-1">
                                    <span className="font-semibold text-stone-800">Durata:</span> {plan.script.durationSeconds}s · <span className="font-semibold text-stone-800">Voce:</span> {plan.audio.voice.label} · <span className="font-semibold text-stone-800">Musica:</span> {plan.audio.music.title}
                                </p>
                            </div>
                            
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                                    Script & Sottotitoli Sincronizzati
                                </h4>
                                <ol className="space-y-2 list-none">
                                    {plan.script.blocks.map((b) => (
                                        <li key={b.label} className="text-xs bg-white rounded-lg border border-stone-200 p-2.5 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-stone-900 bg-stone-100 px-1.5 py-0.5 rounded text-[11px]">
                                                    [{b.startSec}s – {b.endSec}s] {b.label.toUpperCase()}
                                                </span>
                                            </div>
                                            <p className="text-stone-800 font-medium leading-relaxed">
                                                &ldquo;{b.narration}&rdquo;
                                            </p>
                                            <p className="text-stone-500 text-[10px] italic">
                                                Inquadratura: {b.visualDirection}
                                            </p>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        </div>

                        <div className="bg-stone-50 rounded-xl p-3 border border-stone-200 text-xs space-y-1.5">
                            <p className="text-stone-600">
                                <strong className="text-stone-800">Hashtag:</strong> {plan.socialMetadata.hashtags.join(' ')}
                            </p>
                            <p className="text-[11px] text-stone-500">
                                Formato: 1080×1920 (9:16) MP4 H.264 / AAC · Pronto per Instagram Reels
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
