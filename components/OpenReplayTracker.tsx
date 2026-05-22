'use client';

import { useEffect, useRef } from 'react';

export default function OpenReplayTracker() {
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current || typeof window === 'undefined') return;
        startedRef.current = true;

        import('@openreplay/tracker/cjs')
            .then(({ default: OpenReplay }) => {
                const tracker = new OpenReplay({
                    projectKey:
                        process.env.NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY?.trim() ||
                        'RPvj17FQ3rJhQrjzZWmJ',
                    capturePerformance: true,
                });
                return tracker.start();
            })
            .catch((err) => console.error('Errore nel caricamento di OpenReplay:', err));
    }, []);

    return null;
}
