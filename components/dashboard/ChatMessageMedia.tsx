'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Download, ZoomIn, Loader2 } from 'lucide-react';
import MediaLightbox from '@/components/dashboard/MediaLightbox';
import {
    isImageMediaUrl,
    resolveWhatsAppChatMediaUrl,
    whatsAppChatMediaDownloadUrl,
} from '@/lib/whatsapp/chatMediaUrls';
import { downloadMedia } from '@/lib/utils/downloadMedia';

interface ChatMessageMediaProps {
    mediaUrl: string;
    caption?: ReactNode;
}

export default function ChatMessageMedia({ mediaUrl, caption }: ChatMessageMediaProps) {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    const viewUrl = resolveWhatsAppChatMediaUrl(mediaUrl);
    const downloadUrl = whatsAppChatMediaDownloadUrl(mediaUrl) || viewUrl;

    if (!viewUrl) return null;

    const showImage = isImageMediaUrl(mediaUrl);

    const handleDownload = async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        setDownloadError(null);
        try {
            const targetUrl = downloadUrl || viewUrl;
            const res = await downloadMedia({
                url: targetUrl,
                filename: `floremoria-foto-chat-${Date.now()}.jpg`,
                title: 'Foto Chat FloreMoria',
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

    return (
        <div className="space-y-2">
            {showImage ? (
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
        </div>
    );
}

