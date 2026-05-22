'use client';

import dynamic from 'next/dynamic';

const OpenReplayTracker = dynamic(() => import('@/components/OpenReplayTracker'), {
    ssr: false,
});

export default function OpenReplayProvider() {
    return <OpenReplayTracker />;
}
