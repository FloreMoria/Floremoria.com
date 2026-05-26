'use client';

import OpenReplay from '@openreplay/tracker';
import trackerAssist from '@openreplay/tracker-assist';

const projectKey =
    process.env.NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY?.trim() || 'RPvj17FQ3rJhQrjzZWmJ';

function isLocalhostRuntime(): boolean {
    if (typeof window === 'undefined') return false;
    return /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
}

export const tracker = new OpenReplay({
    projectKey,
    capturePerformance: true,
    // In locale OpenReplay richiede SSL pubblico: disabilitiamo il vincolo solo su localhost.
    ...(isLocalhostRuntime() ? { __DISABLE_SECURE_MODE: true } : {}),
});

tracker.use(trackerAssist({}));
