'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Download, ZoomIn } from 'lucide-react';
import MediaLightbox from '@/components/dashboard/MediaLightbox';
import {
    isImageMediaUrl,
    resolveWhatsAppChatMediaUrl,
    whatsAppChatMediaDownloadUrl,
} from '@/lib/whatsapp/chatMediaUrls';

interface ChatMessageMediaProps {
    mediaUrl: string;
    caption?: ReactNode;
}

export default function ChatMessageMedia({ mediaUrl, caption }: ChatMessageMediaProps) {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const viewUrl = resolveWhatsAppChatMediaUrl(mediaUrl);
    const downloadUrl = whatsAppChatMediaDownloadUrl(mediaUrl);

    if (!viewUrl) return null;

    const showImage = isImageMediaUrl(mediaUrl);

    return (
        <div className="space-y-2">
            {showImage ? (
                <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="block w-full overflow-hidden rounded-lg border border-gray-100 bg-gray-50 text-left"
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

            <div className="flex flex-wrap gap-2">
                {showImage ? (
                    <button
                        type="button"
                        onClick={() => setLightboxOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                        Apri
                    </button>
                ) : (
                    <a
                        href={viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        Apri
                    </a>
                )}
                {downloadUrl ? (
                    <a
                        href={downloadUrl}
                        download
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#C0A062]/30 bg-[#FDFCF9] px-3 py-1.5 text-[11px] font-semibold text-[#8A7348] hover:bg-[#FAF8F5]"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Scarica
                    </a>
                ) : null}
            </div>

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
