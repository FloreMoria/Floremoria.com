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

const MAX = 3;

function readFilesAsPreviews(files: File[]): string[] {
    return files.map((f) => URL.createObjectURL(f));
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
    const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const beforeInputRef = useRef<HTMLInputElement>(null);
    const afterInputRef = useRef<HTMLInputElement>(null);

    const beforePreviews = useMemo(() => readFilesAsPreviews(beforeFiles), [beforeFiles]);
    const afterPreviews = useMemo(() => readFilesAsPreviews(afterFiles), [afterFiles]);

    const canSubmit = beforeFiles.length > 0 && afterFiles.length > 0 && !submitting;

    // Permesso GPS all'apertura: niente popup invasivo al momento dell'invio.
    useEffect(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) =>
                setGpsCoords({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                }),
            () => setGpsCoords(null),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 }
        );
    }, []);

    const addFiles = useCallback((slot: Slot, incoming: FileList | null) => {
        if (!incoming?.length) return;
        const list = Array.from(incoming).filter((f) => f.type.startsWith('image/'));
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
            const form = new FormData();
            form.append('orderId', orderId);
            if (gpsCoords) {
                form.append('gpsLatitude', String(gpsCoords.lat));
                form.append('gpsLongitude', String(gpsCoords.lng));
            }
            beforeFiles.forEach((f) => form.append('beforePhotos', f));
            afterFiles.forEach((f) => form.append('afterPhotos', f));

            const res = await fetch('/api/partner/order/upload-proof', {
                method: 'POST',
                body: form,
            });
            const data = (await res.json()) as { ok?: boolean; error?: string };
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
                    All&apos;apertura della pagina chiederemo il permesso GPS per attestare la consegna sul posto.
                    {gpsCoords
                        ? ' Posizione acquisita: l\'invio userà queste coordinate senza ulteriori richieste.'
                        : ' Se non autorizzi il GPS, la consegna potrà comunque essere registrata senza mappa.'}
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
