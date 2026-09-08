'use client';

import React from 'react';
import Link from 'next/link';

interface GoogleSocialProofBadgeProps {
    variant?: 'default' | 'compact' | 'pill' | 'banner';
    className?: string;
}

export const GOOGLE_REVIEWS_COUNT = 34;
export const GOOGLE_REVIEWS_RATING = '5.0';
export const GOOGLE_REVIEWS_URL = 'https://g.page/r/CYtHIOAB65TOEB0/review';

export default function GoogleSocialProofBadge({
    variant = 'default',
    className = '',
}: GoogleSocialProofBadgeProps) {
    if (variant === 'compact') {
        return (
            <a
                href={GOOGLE_REVIEWS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50/90 hover:bg-amber-100/90 border border-amber-200/80 rounded-full text-xs transition-all shadow-xs group ${className}`}
                title="Leggi le 34 recensioni a 5.0 stelle su Google"
            >
                <div className="flex items-center text-amber-500 text-[11px]">
                    ★★★★★
                </div>
                <span className="font-bold text-gray-900 text-xs">5.0</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-700 font-medium text-[11px] group-hover:text-blue-700 transition-colors">
                    34 recensioni su Google
                </span>
            </a>
        );
    }

    if (variant === 'pill') {
        return (
            <a
                href={GOOGLE_REVIEWS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2.5 px-3.5 py-1.5 bg-white/95 hover:bg-white border border-stone-200/90 rounded-full text-xs transition-all shadow-sm group ${className}`}
                title="Leggi le recensioni a 5.0 stelle su Google"
            >
                <div className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    <span className="font-bold text-gray-900">5.0</span>
                    <span className="text-amber-500 tracking-tight">★★★★★</span>
                </div>
                <span className="text-stone-300">|</span>
                <span className="text-stone-600 font-medium group-hover:text-blue-700 transition-colors">
                    34 recensioni verificate
                </span>
                <span className="text-stone-300">|</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    📸 Foto su WhatsApp
                </span>
            </a>
        );
    }

    // Default banner layout
    return (
        <div
            className={`w-full max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-3 sm:gap-6 py-2.5 px-4 bg-[#FDFCF9]/90 border border-stone-200/80 rounded-2xl sm:rounded-full text-xs sm:text-sm text-gray-800 shadow-xs ${className}`}
        >
            <a
                href={GOOGLE_REVIEWS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-gray-900 font-bold hover:text-blue-700 transition-colors"
            >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>5.0</span>
                <span className="text-amber-500">★★★★★</span>
                <span className="text-gray-600 font-medium underline underline-offset-2 ml-1">
                    (34 recensioni su Google)
                </span>
            </a>

            <span className="hidden sm:inline text-stone-300">|</span>

            <span className="flex items-center gap-1.5 font-medium text-gray-700">
                <span className="text-emerald-600 font-bold">📸</span>
                <span>Foto di avvenuta consegna su WhatsApp</span>
            </span>

            <span className="hidden sm:inline text-stone-300">|</span>

            <span className="flex items-center gap-1.5 font-medium text-gray-700">
                <span className="text-fm-gold">🌸</span>
                <span>Fioristi partner in tutta Italia</span>
            </span>
        </div>
    );
}
