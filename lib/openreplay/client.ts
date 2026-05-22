'use client';

import OpenReplay from '@openreplay/tracker';
import trackerAssist from '@openreplay/tracker-assist';

const projectKey =
    process.env.NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY?.trim() || 'RPvj17FQ3rJhQrjzZWmJ';

export const tracker = new OpenReplay({
    projectKey,
    capturePerformance: true,
});

tracker.use(trackerAssist({}));
