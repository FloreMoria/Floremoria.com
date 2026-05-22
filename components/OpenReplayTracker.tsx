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

export default function OpenReplayTracker() {
    const pathname = usePathname();
    const startedRef = useRef(false);

    useEffect(() => {
        if (isExcludedPath(pathname) || startedRef.current || typeof window === 'undefined') {
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
                console.error('[OpenReplay] Errore avvio tracker:', err);
                startedRef.current = false;
            });
    }, [pathname]);

    return null;
}
