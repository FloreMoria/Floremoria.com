'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, X } from 'lucide-react';
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
    const [dragX, setDragX] = useState(0);
    const touchStartRef = useRef({ x: 0, y: 0 });

    const handleClose = useCallback(() => {
        setDashboardOverlayOpen(false);
        onClose();
    }, [onClose]);

    useEdgeSwipeBack(handleClose, true);

    useEffect(() => {
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

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col bg-black/95"
            role="dialog"
            aria-modal="true"
            aria-label="Anteprima immagine"
            onClick={handleClose}
        >
            <div
                className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 shrink-0"
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={handleClose}
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Indietro
                </button>

                <div className="flex items-center gap-2">
                    {downloadUrl ? (
                        <a
                            href={downloadUrl}
                            download
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
                        >
                            <Download className="w-4 h-4" />
                            Scarica
                        </a>
                    ) : null}
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Chiudi"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div
                className="flex-1 flex items-center justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] overflow-hidden"
                onClick={(event) => event.stopPropagation()}
                onTouchStart={(event) => {
                    const touch = event.touches[0];
                    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
                }}
                onTouchMove={(event) => {
                    const touch = event.touches[0];
                    const deltaX = touch.clientX - touchStartRef.current.x;
                    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
                    if (deltaX > 0 && deltaY < 80) {
                        setDragX(deltaX);
                    }
                }}
                onTouchEnd={(event) => {
                    const touch = event.changedTouches[0];
                    const deltaX = touch.clientX - touchStartRef.current.x;
                    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
                    if (deltaX >= 72 && deltaY <= 80) {
                        handleClose();
                    } else {
                        setDragX(0);
                    }
                }}
            >
                <img
                    src={imageUrl}
                    alt={alt}
                    className="max-h-full max-w-full object-contain transition-transform duration-150"
                    style={{
                        transform: dragX > 0 ? `translateX(${dragX}px)` : undefined,
                        opacity: dragX > 0 ? Math.max(0.35, 1 - dragX / 280) : 1,
                    }}
                    draggable={false}
                />
            </div>
        </div>
    );
}
