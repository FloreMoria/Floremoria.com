'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MonumentRecord } from '@/lib/ai/momo/momoMonuments';
import type {
    MomoFormatDescriptor,
    MomoNarrativeFormat,
} from '@/lib/ai/momo/momoStoryteller';
import { MOMO_NARRATIVE_FORMATS } from '@/lib/ai/momo/momoStoryteller';
import type { MomoVoiceProfile, MomoMusicTrack } from '@/lib/ai/momo/momoVoiceAudio';
import type { MomoRenderPlan, MomoSocialChannel } from '@/lib/ai/momo/momoVideoEngine';

type Catalog = {
    monuments: MonumentRecord[];
    formats?: MomoFormatDescriptor[];
    voices: MomoVoiceProfile[];
    music: MomoMusicTrack[];
};

const CHANNELS: Array<{ id: MomoSocialChannel; label: string }> = [
    { id: 'instagram_reels', label: 'Instagram Reels' },
    { id: 'youtube_shorts', label: 'YouTube Shorts' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'facebook', label: 'Facebook' },
];

export default function MomoVideoPanel() {
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [monumentId, setMonumentId] = useState('');
    const [formatId, setFormatId] = useState<MomoNarrativeFormat>('luogo_sospeso');
    const [voiceId, setVoiceId] = useState('none');
    const [musicId, setMusicId] = useState('minimal-piano-einaudi-cc0');
    const [channels, setChannels] = useState<MomoSocialChannel[]>([
        'instagram_reels',
        'tiktok',
    ]);
    const [plan, setPlan] = useState<MomoRenderPlan | null>(null);
    const [loading, setLoading] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [publishNote, setPublishNote] = useState<string | null>(null);
    const [copiedCaption, setCopiedCaption] = useState(false);

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

                // Auto-carica l'anteprima del Reel con footage reale e primo format
                const planRes = await fetch('/api/dashboard/momo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generate',
                        monumentId: firstId,
                        formatId: 'luogo_sospeso',
                        voiceId: 'none',
                        musicId: 'minimal-piano-einaudi-cc0',
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
                    formatId,
                    voiceId: voiceId === 'none' ? undefined : voiceId,
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

    const copyCaption = () => {
        if (!plan?.socialMetadata.description) return;
        navigator.clipboard.writeText(plan.socialMetadata.description);
        setCopiedCaption(true);
        setTimeout(() => setCopiedCaption(false), 2500);
    };

    const selectedMonument = catalog?.monuments.find((m) => m.id === monumentId);
    const availableFormats = catalog?.formats || MOMO_NARRATIVE_FORMATS;
    const selectedFormat = availableFormats.find((f) => f.id === formatId);

    return (
        <section className="rounded-2xl border border-stone-200 bg-gradient-to-b from-stone-50 to-white p-5 md:p-6 space-y-6 shadow-sm">
            <header className="space-y-1">
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                        Footage Reale HD
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                        Anti-Spoiler Guard
                    </span>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        MOMO · Monumental Video Engine
                    </p>
                </div>
                <h2 className="text-xl font-semibold text-stone-900 tracking-tight">
                    Visioni dei Cimiteri Italiani · Format Narrativi Reels 9:16
                </h2>
                <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
                    Nessun quiz scolastico: narrazione visiva ad alta ritenzione, hook misterioso su badge nativo Instagram e didascalie anti-spoiler ottimizzate per stimolare i commenti.
                </p>
            </header>

            {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                    {error}
                </div>
            )}

            {/* Configurazione Scena & Format */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <label className="block space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-stone-500">
                        Luogo & Monumento Reale
                    </span>
                    <select
                        value={monumentId}
                        onChange={(e) => setMonumentId(e.target.value)}
                        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-800 focus:border-stone-400 focus:outline-none"
                    >
                        {(catalog?.monuments || []).map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.cemetery} ({m.city})
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-stone-500">
                        Format Narrativo
                    </span>
                    <select
                        value={formatId}
                        onChange={(e) => setFormatId(e.target.value as MomoNarrativeFormat)}
                        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-800 focus:border-stone-400 focus:outline-none"
                    >
                        {availableFormats.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-stone-500">
                        Voce Narrante
                    </span>
                    <select
                        value={voiceId}
                        onChange={(e) => setVoiceId(e.target.value)}
                        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-800 focus:border-stone-400 focus:outline-none"
                    >
                        <option value="none">Nessuna (Solo pianoforte intimo)</option>
                        {(catalog?.voices || []).map((v) => (
                            <option key={v.id} value={v.id}>
                                {v.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-stone-500">
                        Colonna Sonora (CC0)
                    </span>
                    <select
                        value={musicId}
                        onChange={(e) => setMusicId(e.target.value)}
                        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-800 focus:border-stone-400 focus:outline-none"
                    >
                        {(catalog?.music || []).map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.title} ({t.license})
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {/* Scheda Descrittiva della Visione Paesaggistica del Luogo Selezionato */}
            {selectedMonument && (
                <div className="rounded-xl border border-stone-200 bg-stone-100/70 p-3.5 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-stone-800 uppercase tracking-wider">
                                🏛️ {selectedMonument.cemetery}
                            </span>
                            <span className="text-stone-500">· {selectedMonument.city}</span>
                        </div>
                        <span className="text-stone-600 italic">
                            Personaggio: <strong>{selectedMonument.historicalFigure}</strong>
                        </span>
                    </div>
                    <p className="text-stone-700 leading-relaxed">
                        <strong className="text-stone-900">Visione Paesaggistica:</strong> {selectedMonument.visionLandscape}
                    </p>
                    {selectedMonument.floralNotes && (
                        <p className="text-stone-600">
                            <strong className="text-stone-800">Nota Botanica (Martina):</strong> {selectedMonument.floralNotes}
                        </p>
                    )}
                </div>
            )}

            {/* Canali di Pubblicazione */}
            <div className="space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-stone-500 block">
                    Canali Social di Pubblicazione
                </span>
                <div className="flex flex-wrap gap-2">
                    {CHANNELS.map((c) => {
                        const on = channels.includes(c.id);
                        return (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => toggleChannel(c.id)}
                                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                                    on
                                        ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                                        : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300'
                                }`}
                            >
                                {c.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-1">
                <button
                    type="button"
                    onClick={() => void generate()}
                    disabled={loading || !monumentId}
                    className="rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 hover:bg-stone-800 transition-colors shadow-sm"
                >
                    {loading ? 'MOMO sta componendo…' : 'Componi Reel & Copy'}
                </button>
                <button
                    type="button"
                    onClick={() => void publish()}
                    disabled={!plan || publishing || channels.length === 0}
                    className="rounded-xl border border-rose-500 bg-rose-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 hover:bg-rose-700 transition-colors shadow-sm"
                >
                    {publishing ? 'In coda…' : 'Pubblica su Reels & Social'}
                </button>
                {plan?.videoRelativePath && (
                    <a
                        href={plan.videoRelativePath}
                        download="test_momo_real_reel.mp4"
                        className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-800 hover:bg-stone-50 transition-colors inline-flex items-center gap-1.5"
                    >
                        📥 Scarica MP4
                    </a>
                )}
                {plan?.srtRelativePath && (
                    <a
                        href={plan.srtRelativePath}
                        download="test_momo_real_reel.srt"
                        className="rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-800 hover:bg-stone-50 transition-colors inline-flex items-center gap-1.5"
                    >
                        📄 .SRT Sottotitoli
                    </a>
                )}
            </div>

            {publishNote && (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-medium">
                    ✅ {publishNote}
                </p>
            )}

            {/* Anteprima Video + Copy Anti-Spoiler */}
            {plan && (
                <div className="grid gap-6 md:grid-cols-2 pt-2">
                    {/* Colonna Sinistra: Player Video 9:16 */}
                    <div className="rounded-2xl border border-stone-800 bg-black aspect-[9/16] max-h-[540px] flex flex-col items-center justify-center text-center overflow-hidden shadow-lg relative">
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

                    {/* Colonna Destra: Format Info, Hook & Didascalia Anti-Spoiler */}
                    <div className="space-y-4 text-sm text-stone-700 flex flex-col justify-between">
                        <div className="space-y-3.5">
                            {/* Format Badge & Info */}
                            <div className="bg-stone-100 rounded-xl p-3.5 border border-stone-200 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-stone-900 text-white">
                                        {selectedFormat?.label || plan.script.formatLabel}
                                    </span>
                                    <span className="text-xs text-stone-500 font-medium">
                                        Durata: {plan.script.durationSeconds}s
                                    </span>
                                </div>
                                <p className="font-semibold text-stone-900 text-sm">
                                    {plan.socialMetadata.title}
                                </p>
                                <div className="text-xs text-stone-600 space-y-1">
                                    <p>
                                        <span className="font-semibold text-stone-800">Focus:</span> {selectedFormat?.focus}
                                    </p>
                                    <p>
                                        <span className="font-semibold text-stone-800">Audio:</span> {plan.audio.music.title} {plan.audio.voice ? `+ Voce (${plan.audio.voice.label})` : '(Solo pianoforte)'}
                                    </p>
                                </div>
                            </div>

                            {/* Hook Instagram Nativo (Badge Sticker) */}
                            <div className="bg-white rounded-xl p-3.5 border border-stone-200 space-y-2 shadow-xs">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center justify-between">
                                    <span>Hook Instagram Nativo (Sticker)</span>
                                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                                        Centro Schermo
                                    </span>
                                </h4>
                                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-center">
                                    <p className="text-sm font-bold text-stone-900 bg-white rounded-lg p-3 shadow-sm border border-stone-200 leading-snug">
                                        &ldquo;{plan.script.hookQuestion}&rdquo;
                                    </p>
                                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mt-1.5">
                                        {plan.script.instagramTag}
                                    </span>
                                </div>
                            </div>

                            {/* Didascalia Social Anti-Spoiler */}
                            <div className="bg-white rounded-xl p-3.5 border border-stone-200 space-y-2 shadow-xs">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                                        Didascalia Post (Regola Anti-Spoiler)
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={copyCaption}
                                        className="text-xs font-semibold text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-2.5 py-1 rounded-lg transition-colors inline-flex items-center gap-1"
                                    >
                                        {copiedCaption ? '✅ Copiato!' : '📋 Copia Caption'}
                                    </button>
                                </div>

                                <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 text-xs space-y-2 font-mono text-stone-800 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                                    {plan.socialMetadata.description}
                                </div>
                            </div>
                        </div>

                        {/* Hashtag & Footer note */}
                        <div className="bg-stone-50 rounded-xl p-3 border border-stone-200 text-xs space-y-1.5">
                            <p className="text-stone-600">
                                <strong className="text-stone-800">Hashtags:</strong> {plan.socialMetadata.hashtags.join(' ')}
                            </p>
                            <p className="text-[11px] text-stone-500">
                                Formato: 1080×1920 (9:16) MP4 H.264 / AAC · Footage reale, Musica CC0 & Anti-Spoiler
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

