'use client';

import { useEffect, useRef } from 'react';

interface MemoryGardenTrackerProps {
    orderId?: string | null;
    slug?: string | null;
    buyerEmail?: string | null;
    buyerName?: string | null;
}

export default function MemoryGardenTracker({
    orderId,
    slug,
    buyerEmail,
    buyerName,
}: MemoryGardenTrackerProps) {
    const trackedRef = useRef(false);

    useEffect(() => {
        if (trackedRef.current) return;
        trackedRef.current = true;

        try {
            const payload = JSON.stringify({
                orderId: orderId || null,
                slug: slug || null,
                buyerEmail: buyerEmail || null,
                buyerName: buyerName || null,
            });

            if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
                const blob = new Blob([payload], { type: 'application/json' });
                navigator.sendBeacon('/api/giardino/track-open', blob);
            } else {
                void fetch('/api/giardino/track-open', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true,
                }).catch(() => undefined);
            }
        } catch {
            // Silently catch any tracker failure
        }
    }, [orderId, slug, buyerEmail, buyerName]);

    return null;
}
