'use client';

import { useEffect, useRef } from 'react';
import OpenReplay from '@openreplay/tracker/cjs';

const PROJECT_KEY =
    process.env.NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY?.trim() || 'RPvj17FQ3rJhQrjzZWmJ';

export default function OpenReplayTracker() {
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current || typeof window === 'undefined') return;
        startedRef.current = true;

        const tracker = new OpenReplay({
            projectKey: PROJECT_KEY,
            capturePerformance: true,
        });

        void tracker.start().catch((err: unknown) => {
            console.error('[OpenReplay] Avvio tracker fallito:', err);
        });
    }, []);

    return null;
}
