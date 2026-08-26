'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Download,
    Image as ImageIcon,
    Loader2,
    MapPin,
    RefreshCw,
    RotateCw,
    Trash2,
} from 'lucide-react';
import { downloadFilenameFromProofUrl } from '@/lib/deliveryProof/proofFilenames';
import GardenSharePanel from '@/components/memorial/GardenSharePanel';
import { downloadMedia } from '@/lib/utils/downloadMedia';

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
    /** Link Giardino della Memoria da condividere (WhatsApp / Email). */
    gardenUrl?: string | null;
    senderName?: string | null;
};

/** Download HD via proxy autenticato e helper universale downloadMedia. */
async function forceDownload(orderId: string, url: string, filename: string) {
    const proxyEndpoint = `/api/delivery-proof/download?orderId=${encodeURIComponent(orderId)}&url=${encodeURIComponent(url)}`;
    const res = await downloadMedia({
        url: proxyEndpoint,
        filename,
        title: 'Foto Garanzia Consegna FloreMoria',
    });
    if (!res.success) {
        // Fallback sull'URL diretto se il proxy restituisce errore
        const fallbackRes = await downloadMedia({
            url,
            filename,
            title: 'Foto Garanzia Consegna FloreMoria',
        });
        if (!fallbackRes.success) {
            throw new Error(fallbackRes.error || 'Download non riuscito.');
        }
    }
}


export function proofPhotoDownloadHref(orderId: string, url: string): string {
    return `/api/delivery-proof/download?orderId=${encodeURIComponent(orderId)}&url=${encodeURIComponent(url)}`;
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
                form.append('url', url);
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
            await forceDownload(
                orderId,
                url,
                downloadFilenameFromProofUrl(url, deceasedName)
            );
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
                        className="inline-flex items-center gap-1 rounded-lg border border-[#c5a880]/40 bg-[#c5a880]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#8a7048] hover:bg-[#c5a880]/20"
                    >
                        <Download size={11} />
                        Scarica HD
                    </button>
                    <a
                        href={proofPhotoDownloadHref(orderId, url)}
                        download
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-[#c5a880]"
                    >
                        Link
                    </a>
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
                <div className="flex flex-col gap-1">
                    <button
                        type="button"
                        onClick={handleDownload}
                        disabled={!!busy}
                        className="w-full inline-flex items-center justify-center gap-1 rounded-lg border border-[#c5a880]/50 bg-[#c5a880]/10 py-2 text-[10px] font-bold uppercase tracking-wide text-[#8a7048] hover:bg-[#c5a880]/20"
                    >
                        <Download size={11} />
                        Scarica in alta risoluzione
                    </button>
                    <a
                        href={proofPhotoDownloadHref(orderId, url)}
                        download
                        className="text-center text-[10px] font-medium text-slate-400 underline-offset-2 hover:underline"
                    >
                        Apri / salva sul dispositivo
                    </a>
                </div>
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
    hasPreDeliveryPhotoOpt: _hasPreDeliveryPhotoOpt = false,
    gardenUrl = null,
    senderName = null,
}: Props) {
    const router = useRouter();
    // Sempre mostra le foto "prima" se presenti in DB — indipendente dall'acquisto
    // dell'opzione "foto stato di fatto" (altrimenti resta solo 1 foto "dopo").
    const [beforeUrls, setBeforeUrls] = useState(initialBefore);
    const [afterUrls, setAfterUrls] = useState(initialAfter);

    // Allinea lo stato locale dopo router.refresh() / nuove prove.
    useEffect(() => {
        setBeforeUrls(initialBefore);
        setAfterUrls(initialAfter);
    }, [initialBefore, initialAfter]);

    const hasPhotos = beforeUrls.length > 0 || afterUrls.length > 0;
    const primaryAfter = afterUrls[0] ?? beforeUrls[0];

    const refresh = () => router.refresh();

    const sectionTitle = isAdmin ? 'Prove Visive Custodite' : 'Testimonianza Fotografica';
    const mapHeightClass = isAdmin ? 'h-80' : 'h-40';
    const mapSpan = isAdmin ? 0.01 : 0.005;

    if (!hasPhotos) {
        return null;
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

            {!compact && primaryAfter ? (
                <div className="flex flex-col sm:flex-row gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            forceDownload(
                                orderId,
                                primaryAfter,
                                downloadFilenameFromProofUrl(primaryAfter, deceasedName)
                            )
                        }
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-[#c5a880]/40 bg-[#c5a880]/10 hover:bg-[#c5a880]/20 text-[#8a7048] rounded-xl text-xs font-bold transition-colors"
                    >
                        <Download size={13} />
                        Scarica testimonianza HD
                    </button>
                    {!isAdmin ? (
                        gardenUrl?.trim() ? (
                            <div className="flex-1">
                                <GardenSharePanel
                                    gardenUrl={gardenUrl.trim()}
                                    deceasedName={deceasedName}
                                    senderName={senderName || undefined}
                                    variant="garden"
                                />
                            </div>
                        ) : (
                            <a
                                href={`https://wa.me/?text=${encodeURIComponent(`Ecco la testimonianza fotografica del mio omaggio floreale FloreMoria per ${deceasedName}: ${primaryAfter}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-emerald-200 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-colors bg-white font-bold text-xs"
                            >
                                WhatsApp
                            </a>
                        )
                    ) : (
                        <a
                            href={proofPhotoDownloadHref(orderId, primaryAfter)}
                            download
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-slate-200 hover:border-[#c5a880] rounded-xl text-xs font-bold text-slate-700 bg-white"
                        >
                            <Download size={13} />
                            Link download diretto
                        </a>
                    )}
                </div>
            ) : null}
        </div>
    );
}
