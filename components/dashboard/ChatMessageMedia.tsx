'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Download, ZoomIn, Loader2, Camera, Link2, CheckCircle2 } from 'lucide-react';
import MediaLightbox from '@/components/dashboard/MediaLightbox';
import LinkPhotoToOrderModal from '@/components/dashboard/LinkPhotoToOrderModal';
import {
    isImageMediaUrl,
    resolveWhatsAppChatMediaUrl,
    whatsAppChatMediaDownloadUrl,
} from '@/lib/whatsapp/chatMediaUrls';
import { downloadMedia } from '@/lib/utils/downloadMedia';

interface ChatMessageMediaProps {
    mediaUrl: string;
    caption?: ReactNode;
    orderId?: string | null;
    orderNumber?: string | null;
    onOrderLinked?: (data?: any) => void;
}

export default function ChatMessageMedia({
    mediaUrl,
    caption,
    orderId = null,
    orderNumber = null,
    onOrderLinked,
}: ChatMessageMediaProps) {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isQuickLinking, setIsQuickLinking] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [linkedSuccess, setLinkedSuccess] = useState<boolean>(false);

    const viewUrl = resolveWhatsAppChatMediaUrl(mediaUrl);
    const downloadUrl = whatsAppChatMediaDownloadUrl(mediaUrl) || viewUrl;

    if (!viewUrl) return null;

    const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl);
    const showImage = !isVideo && isImageMediaUrl(mediaUrl);
    const textCaption = typeof caption === 'string' ? caption : '';

    const handleDownload = async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        setDownloadError(null);
        try {
            const targetUrl = downloadUrl || viewUrl;
            const ext = isVideo ? 'mp4' : 'jpg';
            const res = await downloadMedia({
                url: targetUrl,
                filename: `floremoria-media-chat-${Date.now()}.${ext}`,
                title: 'Media Chat FloreMoria',
            });
            if (!res.success) {
                setDownloadError(res.error || 'Errore durante il download.');
                setTimeout(() => setDownloadError(null), 4000);
            }
        } catch {
            setDownloadError('Errore durante il download del file.');
            setTimeout(() => setDownloadError(null), 4000);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleQuick1ClickLink = async () => {
        if (!orderId || isQuickLinking) return;
        setIsQuickLinking(true);
        try {
            const res = await fetch(`/api/dashboard/orders/${orderId}/link-chat-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaUrl: viewUrl || mediaUrl,
                    caption: textCaption,
                    kind: 'after',
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Errore nel collegamento.');
            }
            setLinkedSuccess(true);
            if (onOrderLinked) onOrderLinked(data);
            setTimeout(() => setLinkedSuccess(false), 4000);
        } catch (err) {
            setDownloadError(err instanceof Error ? err.message : 'Errore salvataggio foto su ordine.');
            setTimeout(() => setDownloadError(null), 4000);
        } finally {
            setIsQuickLinking(false);
        }
    };

    return (
        <div className="space-y-2">
            {isVideo ? (
                <div className="block w-full overflow-hidden rounded-lg border border-gray-100 bg-slate-900">
                    <video
                        src={viewUrl}
                        controls
                        loop
                        playsInline
                        className="w-full h-auto max-h-[280px] object-contain"
                    />
                </div>
            ) : showImage ? (
                <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="block w-full overflow-hidden rounded-lg border border-gray-100 bg-gray-50 text-left hover:opacity-95 transition-opacity"
                >
                    <img
                        src={viewUrl}
                        alt="Allegato WhatsApp"
                        className="w-full h-auto max-h-[280px] object-contain"
                        loading="lazy"
                    />
                </button>
            ) : (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Allegato multimediale WhatsApp
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                {showImage ? (
                    <button
                        type="button"
                        onClick={() => setLightboxOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                        Apri
                    </button>
                ) : (
                    <a
                        href={viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        Apri
                    </a>
                )}

                <button
                    type="button"
                    onClick={() => void handleDownload()}
                    disabled={isDownloading}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#C0A062]/40 bg-[#FDFCF9] px-3 py-1.5 text-[11px] font-semibold text-[#8A7348] hover:bg-[#FAF8F5] transition-colors disabled:opacity-60"
                >
                    {isDownloading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8A7348]" />
                    ) : (
                        <Download className="w-3.5 h-3.5" />
                    )}
                    <span>{isDownloading ? 'Download in corso…' : 'Scarica'}</span>
                </button>

                {/* Azione Rapida: Collega a Ordine / Imposta come Prova di Posa */}
                {showImage && (
                    orderId ? (
                        <button
                            type="button"
                            onClick={() => void handleQuick1ClickLink()}
                            disabled={isQuickLinking || linkedSuccess}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold border transition-colors disabled:opacity-80 ${
                                linkedSuccess
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                            }`}
                            title={`Salva come prova di posa per l'ordine #${orderNumber || orderId}`}
                        >
                            {isQuickLinking ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                            ) : linkedSuccess ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                                <Camera className="w-3.5 h-3.5 text-amber-700" />
                            )}
                            <span>
                                {linkedSuccess
                                    ? 'Collegato all\'Ordine! ✨'
                                    : isQuickLinking
                                    ? 'Collegamento…'
                                    : `Salva in Ordine ${orderNumber ? `#${orderNumber}` : ''}`}
                            </span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setLinkModalOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-50 transition-colors shadow-sm"
                            title="Seleziona un ordine e collega questa foto"
                        >
                            <Camera className="w-3.5 h-3.5 text-slate-600" />
                            <span>Collega a Ordine…</span>
                        </button>
                    )
                )}
            </div>

            {downloadError ? (
                <div className="text-[11px] font-medium text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md animate-in fade-in">
                    ⚠️ {downloadError}
                </div>
            ) : null}

            {caption ? <div className="pt-0.5 whitespace-pre-wrap">{caption}</div> : null}

            {lightboxOpen && showImage ? (
                <MediaLightbox
                    imageUrl={viewUrl}
                    downloadUrl={downloadUrl}
                    onClose={() => setLightboxOpen(false)}
                />
            ) : null}

            {linkModalOpen ? (
                <LinkPhotoToOrderModal
                    isOpen={linkModalOpen}
                    mediaUrl={viewUrl || mediaUrl}
                    caption={textCaption}
                    defaultOrderId={orderId}
                    onClose={() => setLinkModalOpen(false)}
                    onSuccess={(data) => {
                        setLinkedSuccess(true);
                        if (onOrderLinked) onOrderLinked(data);
                        setTimeout(() => setLinkedSuccess(false), 4000);
                    }}
                />
            ) : null}
        </div>
    );
}


