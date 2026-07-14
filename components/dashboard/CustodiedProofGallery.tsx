'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Download,
    Image as ImageIcon,
    Loader2,
    MapPin,
    RefreshCw,
    RotateCw,
    Share2,
    Trash2,
} from 'lucide-react';
import { downloadFilenameFromProofUrl } from '@/lib/deliveryProof/proofFilenames';

type Props = {
    orderId: string;
    deceasedName: string;
    initialBefore: string[];
    initialAfter: string[];
    lat?: number | null;
    lng?: number | null;
    isAdmin: boolean;
    showGpsMap: boolean;
    /** Layout compatto per modale scheda utente admin. */
    compact?: boolean;
    hasPreDeliveryPhotoOpt?: boolean;
};

async function forceDownload(url: string, filename: string) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Download non riuscito.');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

type PhotoTileProps = {
    url: string;
    label: string;
    orderId: string;
    deceasedName: string;
    isAdmin: boolean;
    onMutated: () => void;
    onUrlChange: (nextUrl: string) => void;
    onRemove: () => void;
};

function PhotoTile({
    url,
    label,
    orderId,
    deceasedName,
    isAdmin,
    onMutated,
    onUrlChange,
    onRemove,
}: PhotoTileProps) {
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState<'rotate' | 'replace' | 'delete' | 'download' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const runAction = useCallback(
        async (action: 'rotate' | 'replace' | 'delete', file?: File) => {
            setBusy(action === 'replace' ? 'replace' : action);
            setError(null);
            try {
                const form = new FormData();
                form.append('action', action);
                form.append('orderId', orderId);
                form.append('url', url.split('?')[0] ?? url);
                if (file) form.append('file', file);

                const res = await fetch('/api/dashboard/delivery-proof/photo', {
                    method: 'POST',
                    body: form,
                });
                const data = (await res.json()) as { ok?: boolean; error?: string; url?: string };
                if (!res.ok || !data.ok) {
                    throw new Error(data.error || 'Operazione non riuscita.');
                }

                if (action === 'delete') {
                    onRemove();
                } else if (data.url) {
                    onUrlChange(data.url);
                }
                onMutated();
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Errore.');
            } finally {
                setBusy(null);
            }
        },
        [orderId, url, onMutated, onRemove, onUrlChange]
    );

    const handleDownload = async () => {
        setBusy('download');
        setError(null);
        try {
            await forceDownload(url, downloadFilenameFromProofUrl(url, deceasedName));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Download fallito.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-2">
            <div className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={label} className="h-full w-full object-cover" />
                {busy ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                ) : null}
            </div>

            {isAdmin ? (
                <div className="flex flex-wrap gap-1">
                    <button
                        type="button"
                        onClick={handleDownload}
                        disabled={!!busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-[#c5a880] hover:text-[#8a7349]"
                    >
                        <Download size={11} />
                        Scarica
                    </button>
                    <button
                        type="button"
                        onClick={() => replaceInputRef.current?.click()}
                        disabled={!!busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-blue-300 hover:text-blue-700"
                    >
                        <RefreshCw size={11} />
                        Sostituisci
                    </button>
                    <button
                        type="button"
                        onClick={() => runAction('rotate')}
                        disabled={!!busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-amber-300 hover:text-amber-700"
                    >
                        <RotateCw size={11} />
                        Ruota 90°
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (window.confirm('Rimuovere questa foto dalla bacheca?')) {
                                void runAction('delete');
                            }
                        }}
                        disabled={!!busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-600 hover:bg-red-50"
                    >
                        <Trash2 size={11} />
                        Cancella
                    </button>
                    <input
                        ref={replaceInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void runAction('replace', file);
                            e.target.value = '';
                        }}
                    />
                </div>
            ) : (
                <button
                    type="button"
                    onClick={handleDownload}
                    className="w-full inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 text-[10px] font-bold text-slate-600 hover:border-[#c5a880]"
                >
                    <Download size={11} />
                    Scarica
                </button>
            )}
            {error ? <p className="text-[10px] text-red-600">{error}</p> : null}
        </div>
    );
}

export default function CustodiedProofGallery({
    orderId,
    deceasedName,
    initialBefore,
    initialAfter,
    lat,
    lng,
    isAdmin,
    showGpsMap,
    compact = false,
    hasPreDeliveryPhotoOpt = false,
}: Props) {
    const router = useRouter();
    const [beforeUrls, setBeforeUrls] = useState(hasPreDeliveryPhotoOpt ? initialBefore : []);
    const [afterUrls, setAfterUrls] = useState(initialAfter);

    const hasPhotos = beforeUrls.length > 0 || afterUrls.length > 0;
    const primaryAfter = afterUrls[0];

    const refresh = () => router.refresh();

    const sectionTitle = isAdmin ? 'Prove Visive Custodite' : 'Testimonianza Fotografica';
    const mapHeightClass = isAdmin ? 'h-80' : 'h-40';
    const mapSpan = isAdmin ? 0.01 : 0.005;

    if (!hasPhotos) {
        return (
            <div className={compact ? 'w-full' : ''}>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <ImageIcon size={13} /> {sectionTitle}
                </div>
                <div className="bg-slate-50/70 border border-dashed border-slate-200 p-8 rounded-2xl text-center space-y-2.5">
                    <div className="text-slate-300 text-3xl">📷</div>
                    <div className="text-xs font-semibold text-slate-500">
                        {isAdmin ? 'Foto in attesa dal fiorista' : 'Foto non ancora disponibile'}
                    </div>
                    {!isAdmin ? (
                        <p className="text-[11px] text-slate-400 max-w-[200px] mx-auto leading-relaxed">
                            Verrà scattata e caricata sul posto dal fiorista partner al momento della posa.
                        </p>
                    ) : null}
                </div>
            </div>
        );
    }

    const gridClass = compact ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-2';

    return (
        <div className={`space-y-4 animate-in fade-in ${compact ? 'w-full text-left' : ''}`}>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <ImageIcon size={13} /> {sectionTitle}
            </div>

            {beforeUrls.length > 0 ? (
                <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Prima della posa
                    </p>
                    <div className={gridClass}>
                        {beforeUrls.map((url, i) => (
                            <PhotoTile
                                key={`before-${i}-${url}`}
                                url={url}
                                label={`Prima ${i + 1}`}
                                orderId={orderId}
                                deceasedName={deceasedName}
                                isAdmin={isAdmin}
                                onMutated={refresh}
                                onUrlChange={(next) =>
                                    setBeforeUrls((prev) => prev.map((u, idx) => (idx === i ? next : u)))
                                }
                                onRemove={() => setBeforeUrls((prev) => prev.filter((_, idx) => idx !== i))}
                            />
                        ))}
                    </div>
                </div>
            ) : null}

            {afterUrls.length > 0 ? (
                <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Dopo la posa
                    </p>
                    <div className={gridClass}>
                        {afterUrls.map((url, i) => (
                            <PhotoTile
                                key={`after-${i}-${url}`}
                                url={url}
                                label={`Dopo ${i + 1}`}
                                orderId={orderId}
                                deceasedName={deceasedName}
                                isAdmin={isAdmin}
                                onMutated={refresh}
                                onUrlChange={(next) =>
                                    setAfterUrls((prev) => prev.map((u, idx) => (idx === i ? next : u)))
                                }
                                onRemove={() => setAfterUrls((prev) => prev.filter((_, idx) => idx !== i))}
                            />
                        ))}
                    </div>
                </div>
            ) : null}

            {showGpsMap && lat != null && lng != null ? (
                <div className={`overflow-hidden rounded-2xl border border-slate-200 ${isAdmin ? 'w-full' : ''}`}>
                    <iframe
                        title="Mappa consegna"
                        className={`${mapHeightClass} w-full`}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - mapSpan}%2C${lat - mapSpan}%2C${lng + mapSpan}%2C${lat + mapSpan}&layer=mapnik&marker=${lat}%2C${lng}`}
                    />
                    <p className="px-3 py-2 text-[10px] font-mono text-slate-400 bg-slate-50">
                        GPS: {lat.toFixed(6)}, {lng.toFixed(6)}
                    </p>
                </div>
            ) : null}

            {!compact && !isAdmin && primaryAfter ? (
                <div className="flex flex-col sm:flex-row gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            forceDownload(
                                primaryAfter,
                                downloadFilenameFromProofUrl(primaryAfter, deceasedName)
                            )
                        }
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-slate-200 hover:border-[#c5a880] hover:text-[#c5a880] rounded-xl text-xs font-bold transition-colors text-slate-700 bg-white"
                    >
                        <Download size={13} />
                        Scarica testimonianza
                    </button>
                    <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Ecco la testimonianza fotografica del mio omaggio floreale FloreMoria per ${deceasedName}: ${primaryAfter}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-emerald-200 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-colors bg-white font-bold text-xs"
                    >
                        <Share2 size={13} />
                        Condividi con i tuoi cari
                    </a>
                </div>
            ) : null}
        </div>
    );
}
