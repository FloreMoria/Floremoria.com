/**
 * Galleria prove visive per timeline Giardino della Memoria.
 * Mostra tutte le foto Prima/Dopo (nessun limite a [0]) con supporto download diretto.
 */
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Download, Check, ExternalLink, Loader2 } from 'lucide-react';
import { downloadImageDirectly, buildOrderPhotoFilename } from '@/lib/utils/downloadMedia';

type Props = {
    deceasedName: string;
    orderNumber?: string | null;
    orderId?: string | null;
    before: string[];
    after: string[];
    deliveredLabel?: string | null;
};

export default function GardenOrderPhotoGallery({
    deceasedName,
    orderNumber,
    orderId,
    before,
    after,
    deliveredLabel,
}: Props) {
    const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
    const all = [...before, ...after];
    if (all.length === 0) return null;

    const hero = after[0] ?? before[0]!;
    const reference = orderNumber || deceasedName || orderId || 'memoria';

    const handleDownload = async (url: string, index: number) => {
        if (downloadingUrl) return;
        setDownloadingUrl(url);
        try {
            const filename = buildOrderPhotoFilename(reference, index, all.length);
            await downloadImageDirectly(url, filename);
        } finally {
            setDownloadingUrl(null);
        }
    };

    return (
        <div className="mt-4 space-y-4">
            <div className="relative group block h-48 w-full rounded-xl overflow-hidden shadow-sm border border-fm-rose-soft/30 bg-slate-50">
                <Image
                    src={hero}
                    alt={`Testimonianza per ${deceasedName}`}
                    fill
                    className="object-cover transition-transform group-hover:scale-105 duration-700"
                    unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
                    <a
                        href={hero}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-xs font-medium transition-colors"
                    >
                        <ExternalLink size={13} /> Ingrandisci
                    </a>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleDownload(hero, 1);
                        }}
                        disabled={downloadingUrl === hero}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-fm-gold hover:bg-[#a37e42] text-white text-xs font-semibold shadow-md transition-all active:scale-95 disabled:opacity-75"
                    >
                        {downloadingUrl === hero ? (
                            <Loader2 size={13} className="animate-spin" />
                        ) : (
                            <Download size={13} />
                        )}
                        Scarica
                    </button>
                </div>
            </div>

            {before.length > 0 ? (
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-muted mb-2">
                        Prima della posa
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {before.map((url, i) => {
                            const photoIndex = i + 1;
                            return (
                                <div
                                    key={`before-${url}-${i}`}
                                    className="relative group shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-fm-rose-soft/40 bg-slate-50"
                                >
                                    <Image
                                        src={url}
                                        alt={`Prima della posa ${photoIndex}`}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => void handleDownload(url, photoIndex)}
                                            disabled={downloadingUrl === url}
                                            className="p-1 rounded-full bg-white text-slate-800 hover:bg-fm-gold hover:text-white transition-colors shadow"
                                            title="Scarica foto"
                                        >
                                            {downloadingUrl === url ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Download size={12} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {after.length > 0 ? (
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-muted mb-2">
                        Dopo la posa
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {after.map((url, i) => {
                            const photoIndex = before.length + i + 1;
                            return (
                                <div
                                    key={`after-${url}-${i}`}
                                    className="relative group shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-fm-rose-soft/40 bg-slate-50"
                                >
                                    <Image
                                        src={url}
                                        alt={`Dopo la posa ${i + 1}`}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => void handleDownload(url, photoIndex)}
                                            disabled={downloadingUrl === url}
                                            className="p-1 rounded-full bg-white text-slate-800 hover:bg-fm-gold hover:text-white transition-colors shadow"
                                            title="Scarica foto"
                                        >
                                            {downloadingUrl === url ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Download size={12} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-[13px] text-green-700 font-medium flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                        />
                    </svg>
                    Consegna verificata
                    {deliveredLabel ? ` il ${deliveredLabel}` : ''}
                    <span className="text-fm-muted font-normal">
                        {' '}
                        · {all.length} {all.length === 1 ? 'foto' : 'foto'}
                    </span>
                </p>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => void handleDownload(hero, 1)}
                        disabled={downloadingUrl === hero}
                        className="text-[13px] font-semibold text-fm-gold inline-flex items-center gap-1 hover:underline underline-offset-2"
                    >
                        <Download size={13} />
                        Scarica Foto
                    </button>
                    <a
                        href={hero}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] font-semibold text-fm-muted hover:text-fm-text underline underline-offset-2"
                    >
                        Apri in HD
                    </a>
                </div>
            </div>
        </div>
    );
}
