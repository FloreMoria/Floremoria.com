'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Camera, Loader2, MapPin, Send, Trash2 } from 'lucide-react';

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
 * Comprime foto grandi (fotocamera iPhone/Android) in JPEG ≤1600px.
 * Timeout + fallback: se HEIC/createImageBitmap fallisce, invia il file originale
 * (Sharp lato server gestisce HEIF quando disponibile).
 */
async function prepareUploadFile(file: File): Promise<File> {
    // File già piccoli: evita lavoro inutile su rete lenta.
    if (file.size > 0 && file.size < 900_000 && /^image\/(jpeg|jpg|webp)$/i.test(file.type)) {
        return file;
    }
    if (typeof createImageBitmap !== 'function') return file;

    try {
        const bitmap = await withTimeout(
            createImageBitmap(file),
            PREPARE_TIMEOUT_MS,
            'Preparazione foto troppo lenta. Riprova con un’immagine più leggera.'
        );
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height, 1));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            bitmap.close();
            return file;
        }
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        const blob = await withTimeout(
            new Promise<Blob | null>((resolve) => {
                canvas.toBlob(resolve, 'image/jpeg', 0.82);
            }),
            10_000,
            'Compressione foto non riuscita.'
        );
        if (!blob) return file;
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto';
        return new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });
    } catch (err) {
        // HEIC non decodificabile in Safari: lascia al server Sharp.
        console.warn('[florist-upload] prepareUploadFile fallback al file originale:', err);
        return file;
    }
}

/** Parsing sicuro della risposta API (evita errori generici del browser su body non-JSON). */
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
                error: 'Sessione web scaduta sul dispositivo. Chiudi e riapri il link WhatsApp della consegna, poi riprova.',
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
    const [submitting, setSubmitting] = useState(false);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const beforeInputRef = useRef<HTMLInputElement>(null);
    const afterInputRef = useRef<HTMLInputElement>(null);
    const gpsRequestedRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);

    const beforePreviews = useMemo(() => readFilesAsPreviews(beforeFiles), [beforeFiles]);
    const afterPreviews = useMemo(() => readFilesAsPreviews(afterFiles), [afterFiles]);

    // Completa Consegna: almeno 1 scatto Prima e 1 scatto Dopo.
    const canSubmit = beforeFiles.length > 0 && afterFiles.length > 0 && !submitting;

    // Una sola richiesta GPS all'apertura (no doppio pop-up iOS / remount React).
    // Negato / timeout → null: upload prosegue senza GPS.
    useEffect(() => {
        const cached = readCachedGps(orderId);
        if (cached) {
            setGpsCoords(cached);
            return;
        }
        if (gpsRequestedRef.current || typeof navigator === 'undefined' || !navigator.geolocation) {
            return;
        }
        gpsRequestedRef.current = true;

        try {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const coords = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                    };
                    setGpsCoords(coords);
                    writeCachedGps(orderId, coords);
                },
                () => setGpsCoords(null),
                { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
            );
        } catch {
            setGpsCoords(null);
        }
    }, [orderId]);

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
        setStatusMsg('Preparazione foto…');
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const preparedBefore = await Promise.all(beforeFiles.map(prepareUploadFile));
            const preparedAfter = await Promise.all(afterFiles.map(prepareUploadFile));

            setStatusMsg('Invio in corso… non chiudere questa pagina');

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
                    'L’invio ha impiegato troppo tempo (rete lenta o foto troppo grandi). Riprova con 1–2 foto più leggere.'
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
            <div
                className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center px-4 text-center"
                style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
                    ✓
                </div>
                <h1 className="text-xl font-semibold text-emerald-800">Foto caricata con successo</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Consegna completata. Il cliente riceverà il link per visualizzare le foto. Puoi chiudere questa
                    pagina.
                </p>
            </div>
        );
    }

    const orderBrief = (accessories.length > 0 || Boolean(ticketMessage?.trim())) && (
        <section className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900/80">
                Optional / testo da posare
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
            <PhotoSlot
                title="Prima (obbligatoria)"
                subtitle="Almeno 1 foto prima della posa (max 3)"
                previews={beforePreviews}
                count={beforeFiles.length}
                onPick={() => beforeInputRef.current?.click()}
                onRemove={(i) => removeAt('before', i)}
            />
            <input
                ref={beforeInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                className="hidden"
                onChange={(e) => {
                    addFiles('before', e.target.files);
                    e.target.value = '';
                }}
            />

            <PhotoSlot
                title="Dopo (obbligatoria)"
                subtitle="Almeno 1 foto dopo la posa (max 3)"
                previews={afterPreviews}
                count={afterFiles.length}
                onPick={() => afterInputRef.current?.click()}
                onRemove={(i) => removeAt('after', i)}
            />
            {/* Nota: niente capture="environment" — su iPhone forza solo fotocamera e spesso blocca galleria/HEIC. */}
            <input
                ref={afterInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                className="hidden"
                onChange={(e) => {
                    addFiles('after', e.target.files);
                    e.target.value = '';
                }}
            />

            <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                <MapPin size={14} className="mt-0.5 shrink-0 text-[#c5a880]" />
                All&apos;apertura possiamo chiedere il permesso di posizione una sola volta (opzionale).
                {gpsCoords
                    ? ' Posizione acquisita: l’invio userà queste coordinate.'
                    : ' Se non autorizzi la posizione, la consegna viene registrata comunque.'}
            </p>

            {statusMsg ? (
                <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    <Loader2 size={16} className="animate-spin shrink-0 text-[#c5a880]" />
                    {statusMsg}
                </p>
            ) : null}

            {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}
        </>
    );

    // Fix: before slot was missing onRemove in my draft - need to add it back
    // I'll fix in the PhotoSlot calls - I accidentally dropped onRemove for before. Let me fix in StrReplace after write... Actually looking at my write, before PhotoSlot is missing onRemove. Fix now by rewriting that section carefully.

    if (embedded) {
        return (
            <div className="space-y-4">
                {uploadFields}
                <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f172a] py-3 text-sm font-bold text-white transition enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {submitting ? 'Invio in corso…' : 'Completa Consegna'}
                </button>
            </div>
        );
    }

    return (
        <div
            className="mx-auto min-h-[100dvh] max-w-lg bg-[#FAF9F6]"
            style={{
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))',
            }}
        >
            <header
                className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur"
                style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
            >
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a880]">
                    Floremoria · Consegna
                </p>
                <h1 className="mt-1 text-lg font-display font-semibold text-slate-900">{deceasedName}</h1>
                <p className="text-xs text-slate-500">
                    {cemeteryName}, {cemeteryCity}
                    {orderNumber ? ` · ${orderNumber}` : ''}
                </p>
            </header>

            <div className="space-y-6 px-4 py-6">{uploadFields}</div>

            <div
                className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
                <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#0f172a] py-4 text-sm font-bold text-white transition enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    {submitting ? 'Invio in corso…' : 'Completa Consegna'}
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
    onPick,
    onRemove,
}: {
    title: string;
    subtitle: string;
    previews: string[];
    count: number;
    onPick: () => void;
    onRemove?: (index: number) => void;
}) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-bold text-slate-800">{title}</h2>
                    <p className="text-xs text-slate-500">{subtitle}</p>
                </div>
                <span className="text-xs font-semibold text-slate-400">
                    {count}/{MAX}
                </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {previews.map((src, i) => (
                    <div key={src} className="relative aspect-square overflow-hidden rounded-xl border border-slate-100">
                        <Image src={src} alt={`${title} ${i + 1}`} fill className="object-cover" unoptimized />
                        {onRemove ? (
                            <button
                                type="button"
                                onClick={() => onRemove(i)}
                                className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white"
                                aria-label="Rimuovi foto"
                            >
                                <Trash2 size={12} />
                            </button>
                        ) : null}
                    </div>
                ))}
                {count < MAX ? (
                    <button
                        type="button"
                        onClick={onPick}
                        className="flex aspect-square min-h-[96px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 transition active:border-[#c5a880] active:text-[#c5a880]"
                    >
                        <Camera size={22} />
                        <span className="text-[10px] font-bold uppercase">Scatta / Galleria</span>
                    </button>
                ) : null}
            </div>
        </section>
    );
}
