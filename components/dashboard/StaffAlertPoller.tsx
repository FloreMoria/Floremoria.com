'use client';

import { useEffect, useRef } from 'react';
import {
    playStaffAlertSound,
    unlockStaffAlertSounds,
    type StaffAlertSound,
} from '@/lib/dashboard/staffAlertSounds';
import { dashboardJsonFetcher, useDashboardLive } from '@/hooks/useDashboardLive';

interface StaffAlertsSummary {
    inboundMessageCount: number;
    paidOrderCount: number;
    deliveryProofCompletedCount: number;
    floristInboundMediaCount: number;
}

interface Snapshot {
    inboundMessageCount: number;
    paidOrderCount: number;
    deliveryProofCompletedCount: number;
    floristInboundMediaCount: number;
}

/** Polling silenzioso per suoni staff — attivazione/disattivazione da StaffPushNotifications. */
export default function StaffAlertPoller() {
    const baselineRef = useRef<Snapshot | null>(null);

    useEffect(() => {
        const unlock = () => unlockStaffAlertSounds();
        unlock();
        window.addEventListener('pointerdown', unlock, { once: true });

        const onSwMessage = (event: MessageEvent) => {
            const data = event.data as { type?: string; sound?: StaffAlertSound } | null;
            if (data?.type === 'fm-staff-alert' && data.sound) {
                playStaffAlertSound(data.sound);
            }
        };

        navigator.serviceWorker?.addEventListener('message', onSwMessage);

        return () => {
            window.removeEventListener('pointerdown', unlock);
            navigator.serviceWorker?.removeEventListener('message', onSwMessage);
        };
    }, []);

    const { data } = useDashboardLive<{ summary?: StaffAlertsSummary }>(
        '/api/dashboard/staff-alerts/summary',
        dashboardJsonFetcher,
        'chat',
        {
            // Suoni: un po' meno aggressivo del feed chat ma ancora reattivo
            refreshInterval: 8_000,
        }
    );

    useEffect(() => {
        if (typeof document !== 'undefined' && document.hidden) return;

        const summary = data?.summary;
        if (!summary) return;

        const next: Snapshot = {
            inboundMessageCount: summary.inboundMessageCount,
            paidOrderCount: summary.paidOrderCount,
            deliveryProofCompletedCount: summary.deliveryProofCompletedCount,
            floristInboundMediaCount: summary.floristInboundMediaCount,
        };

        const baseline = baselineRef.current;
        if (baseline) {
            if (next.inboundMessageCount > baseline.inboundMessageCount) {
                playStaffAlertSound('whatsapp');
            }
            if (next.paidOrderCount > baseline.paidOrderCount) {
                playStaffAlertSound('order');
            }
            const photoEventsIncreased =
                next.deliveryProofCompletedCount > baseline.deliveryProofCompletedCount ||
                next.floristInboundMediaCount > baseline.floristInboundMediaCount;
            if (photoEventsIncreased) {
                playStaffAlertSound('floristPhoto');
            }
        }

        baselineRef.current = next;
    }, [data]);

    return null;
}
