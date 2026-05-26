'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

function isExcludedPath(pathname: string | null): boolean {
    if (!pathname) return false;
    return (
        pathname.startsWith('/dashboard') ||
        pathname.startsWith('/login') ||
        pathname.startsWith('/admin') ||
        pathname.startsWith('/docs/partner-api')
    );
}

function isDoNotTrackEnabled(): boolean {
    if (typeof navigator === 'undefined') return false;
    return navigator.doNotTrack === '1' || (window as any).doNotTrack === '1';
}

function isExpectedOpenReplayStartError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err || '');
    const normalized = message.toLowerCase();
    return (
        normalized.includes("browser doesn't support required api") ||
        normalized.includes('donottrack is active')
    );
}

export default function OpenReplayTracker() {
    const pathname = usePathname();
    const startedRef = useRef(false);

    useEffect(() => {
        if (isExcludedPath(pathname) || startedRef.current || typeof window === 'undefined') {
            return;
        }

        if (isDoNotTrackEnabled()) {
            return;
        }

        startedRef.current = true;

        import('@/lib/openreplay/client')
            .then(({ tracker }) =>
                tracker.start().then((sessionData) => {
                    if (sessionData && 'success' in sessionData && !sessionData.success) {
                        console.warn('[OpenReplay] Avvio non riuscito:', sessionData.reason);
                        startedRef.current = false;
                    }
                }),
            )
            .catch((err) => {
                if (isExpectedOpenReplayStartError(err)) {
                    if (process.env.NODE_ENV !== 'production') {
                        console.warn('[OpenReplay] Tracker non avviato in questo browser:', err);
                    }
                } else {
                    console.error('[OpenReplay] Errore avvio tracker:', err);
                }
                startedRef.current = false;
            });
    }, [pathname]);

    return null;
}
