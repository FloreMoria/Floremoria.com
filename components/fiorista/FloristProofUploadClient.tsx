'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, MapPin, RefreshCw, Send, Trash2 } from 'lucide-react';
import { formatDeceasedName } from '@/lib/utils/formatDeceasedName';

type Slot = 'before' | 'after';

type Props = {
    orderId: string;
    orderNumber: string | null;
    deceasedName: string;
    cemeteryName: string;
    cemeteryCity: string;
    /** Testo bigliettino / nastro da stampare in posa. */
    ticketMessage?: string | null;
    /** Accessori leggibili (bigliettino, lumino, …). */
    accessories?: string[];
    /** Layout compatto per bacheca admin (no header full-page). */
    embedded?: boolean;
    /** Bypass restrizioni fiorista lato API (solo admin autenticato). */
    adminUpload?: boolean;
    /** Dopo upload: refresh bacheca invece della schermata successo full-page. */
    onUploadComplete?: () => void;
};

type UploadApiResponse = { ok?: boolean; error?: string };

const MAX = 3;
const GPS_CACHE_PREFIX = 'fm-florist-gps:';
const PREPARE_TIMEOUT_MS = 25_000;
const UPLOAD_TIMEOUT_MS = 90_000;

function readFilesAsPreviews(files: File[]): string[] {
    return files.map((f) => URL.createObjectURL(f));
}

function gpsCacheKey(orderId: string): string {
    return `${GPS_CACHE_PREFIX}${orderId}`;
}

function readCachedGps(orderId: string): { lat: number; lng: number } | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(gpsCacheKey(orderId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { lat?: number; lng?: number };
        if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null;
        if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
        return { lat: parsed.lat, lng: parsed.lng };
    } catch {
        return null;
    }
}

function writeCachedGps(orderId: string, coords: { lat: number; lng: number }): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.setItem(gpsCacheKey(orderId), JSON.stringify(coords));
    } catch {
        // sessionStorage pieno o disabilitato — non bloccante
    }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(label)), ms);
        promise.then(
            (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            }
        );
    });
}

/**
 * Comprime foto grandi (fotocamera iPhone/Android 12MP-48MP) in JPEG ≤1600px (~200-400KB).
 * Gestisce timeout e fallback su file originale se il browser non supporta Canvas/ImageBitmap.
 */
async function prepareUploadFile(file: File): Promise<File> {
    if (file.size > 0 && file.size < 700_000 && /^image\/(jpeg|jpg|webp)$/i.test(file.type)) {
        return file;
    }

    try {
        let width = 0;
        let height = 0;
        let drawSource: CanvasImageSource | null = null;

        if (typeof createImageBitmap === 'function') {
            try {
                const bitmap = await withTimeout(
                    createImageBitmap(file),
                    12_000,
                    'Timeout createImageBitmap'
                );
                width = bitmap.width;
                height = bitmap.height;
                drawSource = bitmap;
            } catch {
                // fallback to Image element
            }
        }

        if (!drawSource && typeof window !== 'undefined' && typeof window.Image === 'function') {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const i = new window.Image();
                const url = URL.createObjectURL(file);
                i.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve(i);
                };
                i.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Caricamento immagine fallito'));
                };
                i.src = url;
            });
            width = img.naturalWidth || img.width;
            height = img.naturalHeight || img.height;
            drawSource = img;
        }

        if (!drawSource || width <= 0 || height <= 0) {
            return file;
        }

        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(width, height, 1));
        const targetW = Math.max(1, Math.round(width * scale));
        const targetH = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            if ('close' in drawSource && typeof (drawSource as ImageBitmap).close === 'function') {
                (drawSource as ImageBitmap).close();
            }
            return file;
        }

        ctx.drawImage(drawSource, 0, 0, targetW, targetH);
        if ('close' in drawSource && typeof (drawSource as ImageBitmap).close === 'function') {
            (drawSource as ImageBitmap).close();
        }

        const blob = await withTimeout(
            new Promise<Blob | null>((resolve) => {
                canvas.toBlob(resolve, 'image/jpeg', 0.82);
            }),
            10_000,
            'Compressione foto non riuscita.'
        );

        if (!blob) return file;
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'consegna';
        return new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });
    } catch (err) {
        console.warn('[florist-upload] prepareUploadFile fallback al file originale:', err);
        return file;
    }
}

/** Parsing sicuro della risposta API */
async function parseUploadResponse(res: Response): Promise<UploadApiResponse> {
    if (res.status === 204) return {};

    const raw = await res.text();
    if (!raw.trim()) {
        if (res.status === 413) {
            return { ok: false, error: 'Le foto sono troppo pesanti. Prova con meno immagini o scatta a risoluzione più bassa.' };
        }
        if (res.status === 401) {
            return {
                ok: false,
                error: 'Sessione web scaduta. Chiudi e riapri il link WhatsApp della consegna, poi riprova.',
            };
        }
        return { ok: false, error: `Invio non riuscito (${res.status}). Controlla la connessione e riprova.` };
    }

    try {
        return JSON.parse(raw) as UploadApiResponse;
    } catch {
        return {
            ok: false,
            error:
                res.status === 413
                    ? 'Le foto sono troppo pesanti. Prova con meno immagini.'
                    : `Invio non riuscito (${res.status}). Controlla la connessione e riprova.`,
        };
    }
}

export default function FloristProofUploadClient({
    orderId,
    orderNumber,
    deceasedName,
    cemeteryName,
    cemeteryCity,
    ticketMessage = null,
    accessories = [],
    embedded = false,
    adminUpload = false,
    onUploadComplete,
}: Props) {
    const router = useRouter();
    const [beforeFiles, setBeforeFiles] = useState<File[]>([]);
    const [afterFiles, setAfterFiles] = useState<File[]>([]);
    const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(() =>
        readCachedGps(orderId)
    );
    const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'acquired' | 'fallback'>(() =>
        readCachedGps(orderId) ? 'acquired' : 'idle'
    );
    const [submitting, setSubmitting] = useState(false);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Input Refs per Scatta Foto (camera) e Scegli da Galleria (gallery)
    const beforeCameraInputRef = useRef<HTMLInputElement>(null);
    const beforeGalleryInputRef = useRef<HTMLInputElement>(null);
    const afterCameraInputRef = useRef<HTMLInputElement>(null);
    const afterGalleryInputRef = useRef<HTMLInputElement>(null);

    const gpsRequestedRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);

    const requestGps = useCallback(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setGpsStatus('fallback');
            return;
        }
        setGpsStatus('loading');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                };
                setGpsCoords(coords);
                setGpsStatus('acquired');
                writeCachedGps(orderId, coords);
                setError(null);
            },
            () => {
                // Non bloccare mai l'invio in caso di assenza GPS
                setGpsStatus('fallback');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }, [orderId]);

    const beforePreviews = useMemo(() => readFilesAsPreviews(beforeFiles), [beforeFiles]);
    const afterPreviews = useMemo(() => readFilesAsPreviews(afterFiles), [afterFiles]);

    // Requisito: almeno 1 foto Prima e 1 foto Dopo. GPS NON è mai bloccante!
    const canSubmit = beforeFiles.length > 0 && afterFiles.length > 0 && !submitting;

    // Rilevamento GPS non-bloccante all'avvio
    useEffect(() => {
        const cached = readCachedGps(orderId);
        if (cached) {
            setGpsCoords(cached);
            setGpsStatus('acquired');
            return;
        }
        if (gpsRequestedRef.current || typeof navigator === 'undefined' || !navigator.geolocation) {
            return;
        }
        gpsRequestedRef.current = true;
        requestGps();
    }, [orderId, requestGps]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    const addFiles = useCallback((slot: Slot, incoming: FileList | null) => {
        if (!incoming?.length) return;
        const list = Array.from(incoming).filter(
            (f) =>
                f.type.startsWith('image/') ||
                f.type === '' ||
                /\.(heic|heif|jpg|jpeg|png|webp)$/i.test(f.name)
        );
        if (!list.length) {
            setError('Formato non supportato. Usa foto JPEG, PNG o HEIC dalla fotocamera.');
            return;
        }
        setError(null);
        const setter = slot === 'before' ? setBeforeFiles : setAfterFiles;
        setter((prev) => [...prev, ...list].slice(0, MAX));
    }, []);

    const removeAt = (slot: Slot, index: number) => {
        const setter = slot === 'before' ? setBeforeFiles : setAfterFiles;
        setter((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError(null);
        setStatusMsg('Compressione e preparazione foto…');
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const preparedBefore = await Promise.all(beforeFiles.map(prepareUploadFile));
            const preparedAfter = await Promise.all(afterFiles.map(prepareUploadFile));

            setStatusMsg('Invio conferma in corso… non chiudere la pagina');

            const form = new FormData();
            form.append('orderId', orderId);
            if (adminUpload) {
                form.append('adminBypass', '1');
            }
            if (gpsCoords) {
                form.append('gpsLatitude', gpsCoords.lat.toFixed(6));
                form.append('gpsLongitude', gpsCoords.lng.toFixed(6));
            }
            preparedBefore.forEach((f) => form.append('beforePhotos', f));
            preparedAfter.forEach((f) => form.append('afterPhotos', f));

            const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
            let res: Response;
            try {
                res = await fetch('/api/partner/order/upload-proof', {
                    method: 'POST',
                    body: form,
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timeoutId);
            }

            const data = await parseUploadResponse(res);
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Invio non riuscito. Riprova tra poco.');
            }
            if (onUploadComplete) {
                onUploadComplete();
            } else {
                setSuccess(true);
            }
            router.refresh();
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') {
                setError(
                    'L’invio ha impiegato troppo tempo (connessione debole). Riprova, le immagini sono già state alleggerite.'
                );
            } else {
                setError(e instanceof Error ? e.message : 'Errore durante l’invio. Controlla la connessione e riprova.');
            }
        } finally {
            setSubmitting(false);
            setStatusMsg(null);
        }
    };

    if (success && !embedded) {
        return (
            <div className="mx-auto flex min-h-[80dvh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center bg-[#FAF9F6] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
                    <CheckCircle2 size={44} className="stroke-[2.2]" />
                </div>
                <h1 className="text-2xl font-display font-bold text-slate-900">
                    Consegna registrata con successo!
                </h1>
                <p className="max-w-xs text-sm leading-relaxed text-slate-600">
                    Grazie per il tuo lavoro. Le foto e i dettagli di posa sono stati registrati
                    correttamente.
                </p>
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-5 py-3 text-xs font-semibold text-emerald-800">
                    {orderNumber ? `Ordine: ${orderNumber} · ` : ''}Puoi chiudere questa pagina.
                </div>
            </div>
        );
    }

    const orderBrief = (accessories.length > 0 || Boolean(ticketMessage?.trim())) && (
        <section className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900/80">
                Optional / Note di posa
            </h2>
            {accessories.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm text-slate-700">
                    {accessories.map((label) => (
                        <li key={label}>{label}</li>
                    ))}
                </ul>
            ) : null}
            {ticketMessage?.trim() ? (
                <div className="mt-3 rounded-xl border border-amber-100 bg-white/80 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/70">
                        Testo nastro / biglietto
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm italic leading-relaxed text-slate-800">
                        {ticketMessage.trim()}
                    </p>
                </div>
            ) : null}
        </section>
    );

    const uploadFields = (
        <>
            {orderBrief}

            {/* FASE 1: FOTO PRIMA */}
            <PhotoSlot
                title="1. Foto Prima della posa"
                subtitle="Scatta o carica la foto dello stato iniziale (max 3)"
                previews={beforePreviews}
                count={beforeFiles.length}
                onCamera={() => beforeCameraInputRef.current?.click()}
                onGallery={() => beforeGalleryInputRef.current?.click()}
                onRemove={(i) => removeAt('before', i)}
            />
            {/* Input camera (capture=environment) */}
            <input
                ref={beforeCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                    addFiles('before', e.target.files);
                    e.target.value = '';
                }}
            />
            {/* Input galleria standard */}
            <input
                ref={beforeGalleryInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                className="hidden"
                onChange={(e) => {
                    addFiles('before', e.target.files);
                    e.target.value = '';
                }}
            />

            {/* FASE 2: FOTO DOPO */}
            <PhotoSlot
                title="2. Foto Dopo la posa"
                subtitle="Scatta o carica la foto con fiori e omaggio posati (max 3)"
                previews={afterPreviews}
                count={afterFiles.length}
                onCamera={() => afterCameraInputRef.current?.click()}
                onGallery={() => afterGalleryInputRef.current?.click()}
                onRemove={(i) => removeAt('after', i)}
            />
            {/* Input camera (capture=environment) */}
            <input
                ref={afterCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                    addFiles('after', e.target.files);
                    e.target.value = '';
                }}
            />
            {/* Input galleria standard */}
            <input
                ref={afterGalleryInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                className="hidden"
                onChange={(e) => {
                    addFiles('after', e.target.files);
                    e.target.value = '';
                }}
            />

            {/* STATO GPS NON BLOCCANTE */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
                <div className="flex items-center gap-2">
                    <MapPin
                        size={15}
                        className={`shrink-0 ${
                            gpsStatus === 'acquired'
                                ? 'text-emerald-600'
                                : gpsStatus === 'loading'
                                  ? 'text-amber-500 animate-pulse'
                                  : 'text-slate-400'
                        }`}
                    />
                    <span>
                        {gpsStatus === 'acquired'
                            ? 'Posizione GPS cimitero acquisita'
                            : gpsStatus === 'loading'
                              ? 'Rilevamento GPS in corso…'
                              : 'Coordinate non rilevate (fallback cimitero)'}
                    </span>
                </div>
                {gpsStatus !== 'acquired' && (
                    <button
                        type="button"
                        onClick={requestGps}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 active:bg-slate-100"
                    >
                        <RefreshCw size={11} className={gpsStatus === 'loading' ? 'animate-spin' : ''} />
                        Riprova
                    </button>
                )}
            </div>

            {statusMsg ? (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-900 shadow-sm">
                    <Loader2 size={16} className="animate-spin shrink-0 text-emerald-600" />
                    {statusMsg}
                </p>
            ) : null}

            {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 shadow-sm">
                    {error}
                </p>
            ) : null}
        </>
    );

    if (embedded) {
        return (
            <div className="space-y-4">
                {uploadFields}
                <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f172a] py-3.5 text-sm font-bold text-white transition enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {submitting ? 'Invio in corso…' : 'Invia Conferma di Consegna'}
                </button>
            </div>
        );
    }

    return (
        <div
            className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-between bg-[#FAF9F6] px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
        >
            <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a880]">
                    FloreMoria · Consegna
                </p>
                {orderNumber ? (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Codice ordine
                    </p>
                ) : null}
                {orderNumber ? (
                    <p className="mt-0.5 font-mono text-base font-bold text-slate-900">{orderNumber}</p>
                ) : null}
                <h1 className="mt-3 text-xl font-display font-semibold leading-snug text-slate-900">
                    {formatDeceasedName(deceasedName)}
                </h1>
                <p className="mt-1.5 text-sm text-slate-600">
                    {cemeteryName}
                    {cemeteryCity ? `, ${cemeteryCity}` : ''}
                </p>
            </section>

            <div className="my-4 flex flex-1 flex-col justify-center gap-4">{uploadFields}</div>

            <div className="space-y-3">
                <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-md shadow-emerald-900/10 transition enabled:hover:bg-emerald-700 enabled:active:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                    {submitting ? (
                        <>
                            <Loader2 size={20} className="animate-spin" />
                            <span>Invio in corso…</span>
                        </>
                    ) : (
                        <>
                            <Send size={18} />
                            <span>Invia Conferma di Consegna</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

function PhotoSlot({
    title,
    subtitle,
    previews,
    count,
    onCamera,
    onGallery,
    onRemove,
}: {
    title: string;
    subtitle: string;
    previews: string[];
    count: number;
    onCamera: () => void;
    onGallery: () => void;
    onRemove?: (index: number) => void;
}) {
    return (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-bold text-slate-900">{title}</h2>
                    <p className="text-xs text-slate-500">{subtitle}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${count > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {count}/{MAX}
                </span>
            </div>

            {/* Anteprime foto esistenti */}
            {previews.length > 0 && (
                <div className="mb-3 grid grid-cols-3 gap-2">
                    {previews.map((src, i) => (
                        <div key={src} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 shadow-xs">
                            <Image src={src} alt={`${title} ${i + 1}`} fill className="object-cover" unoptimized />
                            {onRemove ? (
                                <button
                                    type="button"
                                    onClick={() => onRemove(i)}
                                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/80 text-white backdrop-blur transition active:scale-95"
                                    aria-label="Rimuovi foto"
                                >
                                    <Trash2 size={12} />
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}

            {/* Pulsanti per Scatta / Scegli da Galleria se sotto limite MAX */}
            {count < MAX ? (
                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={onCamera}
                        className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 px-3 py-4 text-emerald-900 transition active:bg-emerald-100/70"
                    >
                        <span className="text-2xl" aria-hidden>
                            📸
                        </span>
                        <span className="text-sm font-bold">Scatta Foto</span>
                    </button>
                    <button
                        type="button"
                        onClick={onGallery}
                        className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-slate-700 transition active:bg-slate-100"
                    >
                        <span className="text-2xl" aria-hidden>
                            🖼️
                        </span>
                        <span className="text-sm font-bold">Galleria</span>
                    </button>
                </div>
            ) : null}
        </section>
    );
}
