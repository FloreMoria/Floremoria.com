'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, Loader2, MapPin, Send, Trash2 } from 'lucide-react';

type Slot = 'before' | 'after';

type Props = {
    orderId: string;
    orderNumber: string | null;
    deceasedName: string;
    cemeteryName: string;
    cemeteryCity: string;
};

type UploadApiResponse = { ok?: boolean; error?: string };

const MAX = 3;
const GPS_CACHE_PREFIX = 'fm-florist-gps:';

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

/** Comprime foto ad alta risoluzione (HEIC/JPEG/PNG) in JPEG leggero prima dell'upload. */
async function prepareUploadFile(file: File): Promise<File> {
    if (typeof createImageBitmap !== 'function') return file;
    try {
        const bitmap = await createImageBitmap(file);
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
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.82);
        });
        if (!blob) return file;
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto';
        return new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });
    } catch {
        return file;
    }
}

/** Parsing sicuro della risposta API (evita errori generici del browser su body non-JSON). */
async function parseUploadResponse(res: Response): Promise<UploadApiResponse> {
    if (res.status === 204) return {};

    const raw = await res.text();
    if (!raw.trim()) {
        if (res.status === 413) {
            return { ok: false, error: 'Le foto sono troppo pesanti. Prova con meno immagini.' };
        }
        return { ok: false, error: `Invio non riuscito (${res.status}). Riprova tra poco.` };
    }

    try {
        return JSON.parse(raw) as UploadApiResponse;
    } catch {
        return {
            ok: false,
            error:
                res.status === 413
                    ? 'Le foto sono troppo pesanti. Prova con meno immagini.'
                    : `Invio non riuscito (${res.status}). Riprova tra poco.`,
        };
    }
}

export default function FloristProofUploadClient({
    orderId,
    orderNumber,
    deceasedName,
    cemeteryName,
    cemeteryCity,
}: Props) {
    const [beforeFiles, setBeforeFiles] = useState<File[]>([]);
    const [afterFiles, setAfterFiles] = useState<File[]>([]);
    const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(() =>
        readCachedGps(orderId)
    );
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const beforeInputRef = useRef<HTMLInputElement>(null);
    const afterInputRef = useRef<HTMLInputElement>(null);
    const gpsRequestedRef = useRef(false);

    const beforePreviews = useMemo(() => readFilesAsPreviews(beforeFiles), [beforeFiles]);
    const afterPreviews = useMemo(() => readFilesAsPreviews(afterFiles), [afterFiles]);

    const canSubmit = beforeFiles.length > 0 && afterFiles.length > 0 && !submitting;

    // Una sola richiesta GPS all'apertura (no doppio pop-up iOS / remount React).
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
            { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 }
        );
    }, [orderId]);

    const addFiles = useCallback((slot: Slot, incoming: FileList | null) => {
        if (!incoming?.length) return;
        const list = Array.from(incoming).filter(
            (f) => f.type.startsWith('image/') || /\.(heic|heif|jpg|jpeg|png|webp)$/i.test(f.name)
        );
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
        try {
            const preparedBefore = await Promise.all(beforeFiles.map(prepareUploadFile));
            const preparedAfter = await Promise.all(afterFiles.map(prepareUploadFile));

            const form = new FormData();
            form.append('orderId', orderId);
            if (gpsCoords) {
                form.append('gpsLatitude', gpsCoords.lat.toFixed(6));
                form.append('gpsLongitude', gpsCoords.lng.toFixed(6));
            }
            preparedBefore.forEach((f) => form.append('beforePhotos', f));
            preparedAfter.forEach((f) => form.append('afterPhotos', f));

            const res = await fetch('/api/partner/order/upload-proof', {
                method: 'POST',
                body: form,
            });
            const data = await parseUploadResponse(res);
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Invio non riuscito.');
            }
            setSuccess(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore durante l\'invio.');
        } finally {
            setSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center">
                <div className="mb-4 text-4xl">✓</div>
                <h1 className="text-xl font-semibold text-emerald-800">Consegna registrata</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Le foto sono state inviate. Il cliente riceverà il link per visualizzarle.
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto min-h-screen max-w-lg bg-[#FAF9F6] pb-28">
            <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a880]">Floremoria · Consegna</p>
                <h1 className="mt-1 text-lg font-display font-semibold text-slate-900">{deceasedName}</h1>
                <p className="text-xs text-slate-500">
                    {cemeteryName}, {cemeteryCity}
                    {orderNumber ? ` · ${orderNumber}` : ''}
                </p>
            </header>

            <div className="space-y-6 px-4 py-6">
                <PhotoSlot
                    title="Prima"
                    subtitle="Fino a 3 foto prima della posa"
                    previews={beforePreviews}
                    count={beforeFiles.length}
                    onPick={() => beforeInputRef.current?.click()}
                    onRemove={(i) => removeAt('before', i)}
                />
                <input
                    ref={beforeInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => addFiles('before', e.target.files)}
                />

                <PhotoSlot
                    title="Dopo"
                    subtitle="Fino a 3 foto dopo la posa"
                    previews={afterPreviews}
                    count={afterFiles.length}
                    onPick={() => afterInputRef.current?.click()}
                    onRemove={(i) => removeAt('after', i)}
                />
                <input
                    ref={afterInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => addFiles('after', e.target.files)}
                />

                <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-[#c5a880]" />
                    All&apos;apertura chiederemo una sola volta il permesso di localizzazione del browser per
                    attestare la consegna sul posto.
                    {gpsCoords
                        ? ' Posizione acquisita: l\'invio userà queste coordinate senza ulteriori richieste.'
                        : ' Se non autorizzi la posizione, la consegna verrà registrata comunque senza mappa.'}
                </p>

                {error ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                ) : null}
            </div>

            <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
                <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f172a] py-4 text-sm font-bold text-white transition enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    {submitting ? 'Invio in corso…' : 'Invia foto'}
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
    onRemove: (index: number) => void;
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
                        <button
                            type="button"
                            onClick={() => onRemove(i)}
                            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                            aria-label="Rimuovi foto"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
                {count < MAX ? (
                    <button
                        type="button"
                        onClick={onPick}
                        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-[#c5a880] hover:text-[#c5a880]"
                    >
                        <Camera size={20} />
                        <span className="text-[10px] font-bold uppercase">Aggiungi</span>
                    </button>
                ) : null}
            </div>
        </section>
    );
}
