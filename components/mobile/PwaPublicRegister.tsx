'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Registra SW minimale per installabilità PWA sul sito pubblico (non dashboard).
 */
export default function PwaPublicRegister() {
    const pathname = usePathname();

    useEffect(() => {
        const isAppRoute =
            pathname?.startsWith('/dashboard') ||
            pathname?.startsWith('/fiorista') ||
            pathname?.startsWith('/admin');

        if (isAppRoute || !('serviceWorker' in navigator)) return;

        navigator.serviceWorker.register('/sw-public.js', { scope: '/' }).catch((err) => {
            console.warn('[pwa] sw-public registration failed:', err);
        });
    }, [pathname]);

    return null;
}
