'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MonumentRecord } from '@/lib/ai/momo/momoMonuments';
import type {
    MomoFormatDescriptor,
    MomoNarrativeFormat,
} from '@/lib/ai/momo/momoStoryteller';
import { MOMO_NARRATIVE_FORMATS } from '@/lib/ai/momo/momoStoryteller';
import type { MomoVoiceProfile, MomoMusicTrack } from '@/lib/ai/momo/momoVoiceAudio';
import type { MomoRenderPlan, MomoSocialChannel } from '@/lib/ai/momo/momoVideoEngine';
import type { MomoFetchedAssetResult } from '@/lib/ai/momo';

type Catalog = {
    monuments: MonumentRecord[];
    formats?: MomoFormatDescriptor[];
    voices: MomoVoiceProfile[];
    music: MomoMusicTrack[];
};

const CHANNELS: Array<{ id: MomoSocialChannel; label: string }> = [
    { id: 'instagram_reels', label: 'Instagram Reels' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'youtube_shorts', label: 'YouTube Shorts' },
    { id: 'facebook', label: 'Facebook' },
];

const SUGGESTIONS = [
    { label: 'Porte Sante, Firenze', query: 'Cimitero delle Porte Sante Firenze', figure: 'Collodi, Artusi, Spadolini' },
    { label: 'Mausoleo di Dante, Ravenna', query: 'Tomba di Dante Ravenna', figure: 'Dante Alighieri' },
    { label: 'Staglieno, Genova', query: 'Cimitero Monumentale di Staglieno Genova', figure: 'Mazzini, De André' },
    { label: 'Certosa di Bologna', query: 'Cimitero monumentale della Certosa di Bologna', figure: 'Carducci, Morandi' },
    { label: 'Alessandro Volta, Como', query: 'Tomba di Alessandro Volta Camnago Como', figure: 'Alessandro Volta' },
    { label: 'Cimitero Acattolico, Roma', query: 'Cimitero acattolico di Roma', figure: 'Keats, Shelley, Gramsci' },
];

export default function MomoVideoPanel() {
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [locationQuery, setLocationQuery] = useState('Cimitero delle Porte Sante, Firenze');
    const [formatId, setFormatId] = useState<MomoNarrativeFormat>('luogo_sospeso');
    const [voiceId, setVoiceId] = useState('none');
    const [musicId, setMusicId] = useState('minimal-piano-einaudi-cc0');
    const [customHook, setCustomHook] = useState('');
    const [channels, setChannels] = useState<MomoSocialChannel[]>([
        'instagram_reels',
        'tiktok',
    ]);

    // Stato ricerca asset reali & Wikipedia
    const [searchingAssets, setSearchingAssets] = useState(false);
    const [fetchedAssets, setFetchedAssets] = useState<MomoFetchedAssetResult | null>(null);
    const [selectedImages, setSelectedImages] = useState<string[]>([]);

    // Stato Drag & Drop / Upload file
    const [uploadedMedia, setUploadedMedia] = useState<{
        path: string;
        name: string;
        size: number;
        type: 'video' | 'image';
    } | null>(null);
    const [uploading, setUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Stato Rendering & Pubblicazione
    const [plan, setPlan] = useState<MomoRenderPlan | null>(null);
    const [rendering, setRendering] = useState(false);
    const [renderStep, setRenderStep] = useState<string>('');
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [publishNote, setPublishNote] = useState<string | null>(null);
    const [copiedCaption, setCopiedCaption] = useState(false);

    // Caricamento catalogo iniziale e primo reel di anteprima
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/dashboard/momo', { cache: 'no-store' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Catalogo MOMO non disponibile');
                if (cancelled) return;
                setCatalog(data);

                // Carica automaticamente l'anteprima di Porte Sante Firenze
                const planRes = await fetch('/api/dashboard/momo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generate',
                        query: 'Cimitero delle Porte Sante Firenze',
                        formatId: 'luogo_sospeso',
                        voiceId: 'none',
                        musicId: 'minimal-piano-einaudi-cc0',
                        autoRender: false,
                    }),
                });
                const planData = await planRes.json();
                if (planRes.ok && planData.plan && !cancelled) {
                    setPlan(planData.plan);
                    if (planData.plan.fetchedAssets) {
                        setFetchedAssets(planData.plan.fetchedAssets);
                        setSelectedImages(planData.plan.fetchedAssets.imagePaths || []);
                    }
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

    // Ricerca manuale di asset storici reali
    const searchAssets = async (queryToSearch?: string) => {
        const query = (queryToSearch || locationQuery).trim();
        if (!query) return;
        setSearchingAssets(true);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/momo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'search', query }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Ricerca asset non riuscita');
            if (data.assets) {
                setFetchedAssets(data.assets);
                setSelectedImages(data.assets.imagePaths || []);
                setUploadedMedia(null);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore ricerca asset storici');
        } finally {
            setSearchingAssets(false);
        }
    };

    // Upload file drag & drop
    const handleFileUpload = async (file: File) => {
        setUploading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/dashboard/momo/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload non riuscito');
            setUploadedMedia({
                path: data.path,
                name: data.name,
                size: data.size,
                type: data.type,
            });
            if (data.type === 'image') {
                setSelectedImages((prev) => [data.path, ...prev]);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore caricamento file');
        } finally {
            setUploading(false);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            void handleFileUpload(e.dataTransfer.files[0]);
        }
    };

    const toggleChannel = useCallback((id: MomoSocialChannel) => {
        setChannels((prev) =>
            prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
        );
    }, []);

    const toggleImageSelection = (path: string) => {
        setSelectedImages((prev) =>
            prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
        );
    };

    // Generazione e rendering del Reel con Ken Burns / footage reale
    const generateAndRender = async () => {
        setRendering(true);
        setRenderStep('Ricerca fonti e composizione documentaristica Ken Burns…');
        setError(null);
        setPublishNote(null);
        try {
            const res = await fetch('/api/dashboard/momo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generate',
                    query: locationQuery,
                    formatId,
                    voiceId: voiceId === 'none' ? undefined : voiceId,
                    musicId,
                    customHookQuestion: customHook.trim() || undefined,
                    customImages: selectedImages.length > 0 ? selectedImages : undefined,
                    customVideoPath: uploadedMedia?.type === 'video' ? uploadedMedia.path : undefined,
                    fetchedAssets: fetchedAssets || undefined,
                    autoRender: true,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Generazione fallita');
            setPlan(data.plan);
            if (data.plan.fetchedAssets) {
                setFetchedAssets(data.plan.fetchedAssets);
            }
            setRenderStep('Render completato con successo!');
        } catch (e) {
            setPlan(null);
            setError(e instanceof Error ? e.message : 'Errore durante la generazione e il rendering');
        } finally {
            setRendering(false);
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

    const availableFormats = catalog?.formats || MOMO_NARRATIVE_FORMATS;
    const selectedFormat = availableFormats.find((f) => f.id === formatId);

    return (
        <section className="rounded-2xl border border-stone-200 bg-gradient-to-b from-stone-50 to-white p-5 md:p-6 space-y-6 shadow-sm">
            {/* Header MOMO */}
            <header className="space-y-1">
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                        Asset Reali & Ken Burns HD
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                        Anti-Spoiler Guard
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
                        Open Search
                    </span>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        MOMO · Real Archive Video Engine
                    </p>
                </div>
                <h2 className="text-xl font-semibold text-stone-900 tracking-tight">
                    Ricerca Asset Reali & Video Montaggio Ken Burns 9:16
                </h2>
                <p className="text-sm text-stone-600 max-w-3xl leading-relaxed">
                    Inserisci qualsiasi cimitero, monumento o personaggio storico. MOMO ricerca automaticamente foto storiche autentiche in alta definizione da Wikimedia Commons, recupera il contesto da Wikipedia e genera un montaggio documentaristico fluido con pianoforte neoclassico e didascalie anti-spoiler.
                </p>
            </header>

            {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-900 flex items-center justify-between">
                    <span>⚠️ {error}</span>
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        className="text-xs text-rose-700 hover:text-rose-900 font-bold"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* SEZIONE 1: Campo di Testo Aperto & Suggestion Chips */}
            <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-600 block">
                        Inserisci Luogo, Cimitero o Personaggio Storico
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={locationQuery}
                                onChange={(e) => setLocationQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void searchAssets();
                                    }
                                }}
                                placeholder="Es: Cimitero delle Porte Sante Firenze, Mausoleo di Dante Ravenna, Staglieno Genova…"
                                className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-4 py-2.5 text-sm font-medium text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:bg-white focus:outline-none transition-colors"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => void searchAssets()}
                            disabled={searchingAssets || !locationQuery.trim()}
                            className="rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 hover:bg-stone-800 transition-colors shadow-sm inline-flex items-center justify-center gap-1.5 shrink-0"
                        >
                            {searchingAssets ? (
                                <>
                                    <span className="animate-spin text-sm">⏳</span> Ricerca Fonti…
                                </>
                            ) : (
                                <>🔍 Cerca Asset HD</>
                            )}
                        </button>
                    </div>
                </div>

                {/* Suggestion Chips */}
                <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-stone-500 block">
                        Suggerimenti rapidi:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {SUGGESTIONS.map((s) => (
                            <button
                                key={s.label}
                                type="button"
                                onClick={() => {
                                    setLocationQuery(s.query);
                                    void searchAssets(s.query);
                                }}
                                className="rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 transition-colors inline-flex items-center gap-1"
                            >
                                <span className="text-stone-400">🏛️</span> {s.label}
                                <span className="text-[10px] text-stone-400 hidden md:inline">({s.figure})</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* SEZIONE 2: Galleria Asset Trovati & Drag and Drop Footage */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Scheda Foto Storiche Trovate da Wikimedia */}
                <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                            <span>📸 Fotografie Autentiche HD ({selectedImages.length} selezionate)</span>
                        </span>
                        {fetchedAssets && (
                            <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                                Wikimedia Commons CC
                            </span>
                        )}
                    </div>

                    {fetchedAssets?.imagePaths && fetchedAssets.imagePaths.length > 0 ? (
                        <div className="space-y-2">
                            <div className="grid grid-cols-4 gap-2">
                                {fetchedAssets.imagePaths.map((img: string, idx: number) => {
                                    const selected = selectedImages.includes(img);
                                    const isVideo = /\.(mp4|mov|webm)$/i.test(img);
                                    return (
                                        <button
                                            key={img}
                                            type="button"
                                            onClick={() => toggleImageSelection(img)}
                                            className={`relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all group ${
                                                selected
                                                    ? 'border-emerald-600 ring-2 ring-emerald-500/30'
                                                    : 'border-stone-200 opacity-60 hover:opacity-100'
                                            }`}
                                        >
                                            {isVideo ? (
                                                <div className="w-full h-full bg-stone-900 flex items-center justify-center text-white text-[10px] font-bold">
                                                    VIDEO
                                                </div>
                                            ) : (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={img}
                                                    alt={`Asset ${idx + 1}`}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            )}
                                            <div
                                                className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                    selected
                                                        ? 'bg-emerald-600 text-white'
                                                        : 'bg-black/60 text-white'
                                                }`}
                                            >
                                                {selected ? '✓' : idx + 1}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] text-stone-500">
                                💡 Clicca sulle immagini per includerle/escluderle dalla sequenza documentaristica Ken Burns.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/50 p-6 text-center space-y-1">
                            <p className="text-xs font-semibold text-stone-600">
                                Nessuna fotografia caricata al momento.
                            </p>
                            <p className="text-[11px] text-stone-400">
                                Inserisci un luogo in alto e clicca su &ldquo;Cerca Asset HD&rdquo; per scaricare foto storiche reali.
                            </p>
                        </div>
                    )}

                    {/* Contesto Storico & Visione Estratta */}
                    {fetchedAssets && (
                        <div className="rounded-xl border border-stone-100 bg-stone-50 p-3 text-xs space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-stone-700">
                                <span>🏛️ {fetchedAssets.locationName} ({fetchedAssets.city})</span>
                                <span className="text-stone-500">{fetchedAssets.historicalFigure}</span>
                            </div>
                            <p className="text-stone-600 leading-relaxed text-[11px]">
                                {fetchedAssets.summaryExtract || fetchedAssets.visionLandscape}
                            </p>
                        </div>
                    )}
                </div>

                {/* Scheda Drag & Drop Footage dal Vivo */}
                <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-stone-600">
                            🎥 Oppure carica Footage Reale dal Vivo
                        </span>
                        {uploadedMedia && (
                            <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5">
                                Media Personale Caricato
                            </span>
                        )}
                    </div>

                    <div
                        onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-2 ${
                            isDragging
                                ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
                                : 'border-stone-300 hover:border-stone-400 bg-stone-50/50'
                        }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*,image/*"
                            onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                    void handleFileUpload(e.target.files[0]);
                                }
                            }}
                            className="hidden"
                        />
                        <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-xl text-stone-600">
                            {uploading ? '⏳' : '📁'}
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-xs font-bold text-stone-800">
                                {uploading ? 'Caricamento in corso…' : 'Trascina qui un tuo video o foto grezzo'}
                            </p>
                            <p className="text-[11px] text-stone-500">
                                MP4, MOV, JPG, PNG (senza scritte o adesivi pregressi)
                            </p>
                        </div>
                    </div>

                    {uploadedMedia && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 flex items-center justify-between text-xs text-emerald-900">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className="font-bold">✓ {uploadedMedia.type === 'video' ? '🎬' : '🖼️'}</span>
                                <span className="truncate font-medium">{uploadedMedia.name}</span>
                                <span className="text-[10px] text-emerald-700 shrink-0">
                                    ({Math.round(uploadedMedia.size / 1024)} KB)
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setUploadedMedia(null);
                                }}
                                className="text-xs text-emerald-700 hover:text-emerald-950 font-bold px-1.5 py-0.5"
                            >
                                Rimuovi
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* SEZIONE 3: Configurazione Format, Audio & Hook */}
            <div className="grid gap-4 md:grid-cols-3">
                <label className="block space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-stone-500">
                        Format Narrativo (3 Format Esclusivi)
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
                        <option value="none">Nessuna (Solo pianoforte intimo neoclassico)</option>
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

            {/* Hook Sticker Personalizzato (Opzionale) */}
            <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-stone-500 flex items-center justify-between">
                    <span>Testo Hook Sticker Nativo Instagram (Al centro dello schermo)</span>
                    <span className="text-[10px] text-stone-400 normal-case">
                        Lascia vuoto per usare il testo predefinito ad alta curiosità
                    </span>
                </label>
                <input
                    type="text"
                    value={customHook}
                    onChange={(e) => setCustomHook(e.target.value)}
                    placeholder="Es: Ci sono luoghi dove la bellezza del paesaggio incontra la pace eterna."
                    className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
                />
            </div>

            {/* SEZIONE 4: Canali Social & Pulsanti Azione */}
            <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-stone-500 block">
                        Canali Social di Destinazione
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

                <div className="flex flex-wrap gap-3 pt-2">
                    <button
                        type="button"
                        onClick={() => void generateAndRender()}
                        disabled={rendering || !locationQuery.trim()}
                        className="rounded-xl bg-stone-900 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 hover:bg-stone-800 transition-colors shadow-sm inline-flex items-center gap-2"
                    >
                        {rendering ? (
                            <>
                                <span className="animate-spin text-sm">⏳</span> {renderStep || 'MOMO sta montando il Reel…'}
                            </>
                        ) : (
                            <>🎬 Genera & Renderizza Reel 9:16</>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => void publish()}
                        disabled={!plan || publishing || channels.length === 0}
                        className="rounded-xl border border-rose-500 bg-rose-600 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 hover:bg-rose-700 transition-colors shadow-sm inline-flex items-center gap-1.5"
                    >
                        {publishing ? 'In coda…' : '🚀 Pubblica su Reels & Social'}
                    </button>
                    {plan?.videoRelativePath && (
                        <a
                            href={plan.videoRelativePath}
                            download="test_momo_real_reel.mp4"
                            className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wider text-stone-800 hover:bg-stone-50 transition-colors inline-flex items-center gap-1.5 shadow-xs"
                        >
                            📥 Scarica MP4
                        </a>
                    )}
                    {plan?.srtRelativePath && (
                        <a
                            href={plan.srtRelativePath}
                            download="test_momo_real_reel.srt"
                            className="rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-xs font-bold uppercase tracking-wider text-stone-800 hover:bg-stone-50 transition-colors inline-flex items-center gap-1.5 shadow-xs"
                        >
                            📄 .SRT Sottotitoli
                        </a>
                    )}
                </div>
            </div>

            {publishNote && (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 font-medium">
                    ✅ {publishNote}
                </p>
            )}

            {/* SEZIONE 5: Anteprima Video Verticale 9:16 + Sticker Nativo + Didascalia Anti-Spoiler */}
            {plan && (
                <div className="grid gap-6 md:grid-cols-2 pt-2 border-t border-stone-200">
                    {/* Colonna Sinistra: Player Video 9:16 */}
                    <div className="rounded-2xl border border-stone-800 bg-black aspect-[9/16] max-h-[580px] flex flex-col items-center justify-center text-center overflow-hidden shadow-lg relative mx-auto w-full max-w-[340px]">
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
                                        Durata: {plan.script.durationSeconds}s · 1080×1920 (9:16)
                                    </span>
                                </div>
                                <p className="font-semibold text-stone-900 text-sm">
                                    {plan.socialMetadata.title}
                                </p>
                                <div className="text-xs text-stone-600 space-y-1">
                                    <p>
                                        <span className="font-semibold text-stone-800">Focus Narrativo:</span> {selectedFormat?.focus}
                                    </p>
                                    <p>
                                        <span className="font-semibold text-stone-800">Colonna Sonora:</span> {plan.audio.music.title} {plan.audio.voice ? `+ Voce (${plan.audio.voice.label})` : '(Solo pianoforte)'}
                                    </p>
                                </div>
                            </div>

                            {/* Hook Instagram Nativo (Badge Sticker) */}
                            <div className="bg-white rounded-xl p-3.5 border border-stone-200 space-y-2 shadow-xs">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center justify-between">
                                    <span>Hook Instagram Nativo (Sticker)</span>
                                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                                        Badge Bianco Arrotondato
                                    </span>
                                </h4>
                                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-center space-y-1.5">
                                    <p className="text-sm font-bold text-stone-900 bg-white rounded-xl p-3.5 shadow-sm border border-stone-200 leading-snug">
                                        &ldquo;{plan.script.hookQuestion}&rdquo;
                                    </p>
                                    <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block">
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

                                <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 text-xs space-y-2 font-mono text-stone-800 whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto">
                                    {plan.socialMetadata.description}
                                </div>
                            </div>
                        </div>

                        {/* Hashtag & Footer info */}
                        <div className="bg-stone-50 rounded-xl p-3 border border-stone-200 text-xs space-y-1.5">
                            <p className="text-stone-600">
                                <strong className="text-stone-800">Hashtags:</strong> {plan.socialMetadata.hashtags.join(' ')}
                            </p>
                            <p className="text-[11px] text-stone-500">
                                Composizione: Ken Burns su fotografie autentiche Wikimedia Commons / Footage reale · Audio intimo CC0
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
