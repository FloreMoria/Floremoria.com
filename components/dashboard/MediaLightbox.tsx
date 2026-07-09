'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Download, Share2, X } from 'lucide-react';
import {
    setDashboardOverlayOpen,
    useEdgeSwipeBack,
} from '@/lib/dashboard/useEdgeSwipeBack';

interface MediaLightboxProps {
    imageUrl: string;
    downloadUrl?: string | null;
    alt?: string;
    onClose: () => void;
}

export default function MediaLightbox({
    imageUrl,
    downloadUrl,
    alt = 'Allegato WhatsApp',
    onClose,
}: MediaLightboxProps) {
    const [mounted, setMounted] = useState(false);
    const [dragX, setDragX] = useState(0);
    const [sharing, setSharing] = useState(false);
    const touchStartRef = useRef({ x: 0, y: 0 });

    const handleClose = useCallback(() => {
        setDashboardOverlayOpen(false);
        onClose();
    }, [onClose]);

    useEdgeSwipeBack(handleClose, true, { allowWhenOverlayOpen: true });

    useEffect(() => {
        setMounted(true);
        setDashboardOverlayOpen(true);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', onKeyDown);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
            setDashboardOverlayOpen(false);
        };
    }, [handleClose]);

    const handleShare = useCallback(async () => {
        if (sharing) return;
        setSharing(true);
        try {
            const shareUrl = downloadUrl || imageUrl;
            if (navigator.share) {
                try {
                    const response = await fetch(imageUrl);
                    const blob = await response.blob();
                    const extension = blob.type.includes('png') ? 'png' : 'jpg';
                    const file = new File([blob], `foto-floremoria.${extension}`, {
                        type: blob.type || 'image/jpeg',
                    });
                    if (navigator.canShare?.({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: 'Foto FloreMoria',
                            text: 'Foto da chat staff FloreMoria',
                        });
                        return;
                    }
                } catch {
                    /* fallback URL sotto */
                }
                await navigator.share({
                    title: 'Foto FloreMoria',
                    text: 'Foto da chat staff FloreMoria',
                    url: shareUrl,
                });
                return;
            }
            if (shareUrl) {
                window.open(shareUrl, '_blank', 'noopener,noreferrer');
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return;
            console.error('[media-lightbox] share failed', error);
        } finally {
            setSharing(false);
        }
    }, [downloadUrl, imageUrl, sharing]);

    if (!mounted) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex flex-col bg-black/95 touch-none"
            role="dialog"
            aria-modal="true"
            aria-label="Anteprima immagine"
        >
            <div className="relative z-10 flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 shrink-0 bg-gradient-to-b from-black/80 to-transparent">
                <button
                    type="button"
                    onClick={handleClose}
                    className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/25 active:scale-[0.98]"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Indietro
                </button>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void handleShare()}
                        disabled={sharing}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/25 active:scale-[0.98] disabled:opacity-60"
                    >
                        <Share2 className="w-4 h-4" />
                        Condividi
                    </button>
                    {downloadUrl ? (
                        <a
                            href={downloadUrl}
                            download
                            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/25 active:scale-[0.98]"
                        >
                            <Download className="w-4 h-4" />
                            Scarica
                        </a>
                    ) : null}
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Chiudi"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 active:scale-[0.98]"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div
                className="relative z-0 flex-1 flex items-center justify-center px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] overflow-hidden touch-pan-y"
                onTouchStart={(event) => {
                    const touch = event.touches[0];
                    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
                }}
                onTouchMove={(event) => {
                    const touch = event.touches[0];
                    const deltaX = touch.clientX - touchStartRef.current.x;
                    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
                    if (deltaX > 8 && deltaY < 100) {
                        setDragX(deltaX);
                    }
                }}
                onTouchEnd={(event) => {
                    const touch = event.changedTouches[0];
                    const deltaX = touch.clientX - touchStartRef.current.x;
                    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
                    if (deltaX >= 64 && deltaY <= 100) {
                        handleClose();
                    } else {
                        setDragX(0);
                    }
                }}
            >
                <img
                    src={imageUrl}
                    alt={alt}
                    className="max-h-[calc(100dvh-5.5rem)] max-w-full object-contain transition-transform duration-150 select-none"
                    style={{
                        transform: dragX > 0 ? `translateX(${dragX}px)` : undefined,
                        opacity: dragX > 0 ? Math.max(0.35, 1 - dragX / 280) : 1,
                    }}
                    draggable={false}
                />
            </div>
        </div>,
        document.body
    );
}
