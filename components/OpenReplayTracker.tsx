'use client';

import { useEffect, useRef } from 'react';

export default function OpenReplayTracker() {
    const startedRef = useRef(false);

    useEffect(() => {
        // Blocco di sicurezza tassativo per il server e build statico
        if (typeof window === 'undefined' || startedRef.current) return;

        startedRef.current = true;

        // Import dinamico della libreria standard ESM
        import('@openreplay/tracker')
            .then(({ default: OpenReplay }) => {
                const tracker = new OpenReplay({
                    projectKey:
                        process.env.NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY ||
                        'RPvj17FQ3rJhQrjzZWmJ',
                    capturePerformance: true,
                });
                tracker.start();
            })
            .catch((err) => console.error('Errore caricamento OpenReplay:', err));
    }, []);

    return null;
}
