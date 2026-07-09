'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
    areStaffAlertSoundsMuted,
    areStaffAlertSoundsUnlocked,
    playStaffAlertSound,
    setStaffAlertSoundsMuted,
    unlockStaffAlertSounds,
    type StaffAlertSound,
} from '@/lib/dashboard/staffAlertSounds';

const POLL_MS = 4000;

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

function emptySnapshot(): Snapshot {
    return {
        inboundMessageCount: 0,
        paidOrderCount: 0,
        deliveryProofCompletedCount: 0,
        floristInboundMediaCount: 0,
    };
}

export default function StaffAlertPoller() {
    const baselineRef = useRef<Snapshot | null>(null);
    const [needsUnlock, setNeedsUnlock] = useState(false);
    const [muted, setMuted] = useState(false);

    const handleUnlock = useCallback(() => {
        unlockStaffAlertSounds();
        setNeedsUnlock(!areStaffAlertSoundsUnlocked());
    }, []);

    const toggleMuted = useCallback(() => {
        const nextMuted = !areStaffAlertSoundsMuted();
        setStaffAlertSoundsMuted(nextMuted);
        setMuted(nextMuted);
        if (!nextMuted) {
            unlockStaffAlertSounds();
            setNeedsUnlock(!areStaffAlertSoundsUnlocked());
        }
    }, []);

    useEffect(() => {
        setMuted(areStaffAlertSoundsMuted());
        setNeedsUnlock(!areStaffAlertSoundsUnlocked());

        const onPointerDown = () => {
            unlockStaffAlertSounds();
            setNeedsUnlock(!areStaffAlertSoundsUnlocked());
        };

        window.addEventListener('pointerdown', onPointerDown, { once: true });

        const onSwMessage = (event: MessageEvent) => {
            const data = event.data as { type?: string; sound?: StaffAlertSound } | null;
            if (data?.type === 'fm-staff-alert' && data.sound) {
                playStaffAlertSound(data.sound);
            }
        };

        navigator.serviceWorker?.addEventListener('message', onSwMessage);

        return () => {
            window.removeEventListener('pointerdown', onPointerDown);
            navigator.serviceWorker?.removeEventListener('message', onSwMessage);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function poll() {
            try {
                const res = await fetch('/api/dashboard/staff-alerts/summary', {
                    cache: 'no-store',
                });
                if (!res.ok || cancelled) return;

                const data = await res.json();
                const summary = data.summary as StaffAlertsSummary | undefined;
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
            } catch {
                /* rete o sessione scaduta */
            }
        }

        void poll();
        const interval = setInterval(() => void poll(), POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    return (
        <>
            {needsUnlock ? (
                <button
                    type="button"
                    onClick={handleUnlock}
                    className="fixed bottom-16 left-4 right-4 md:left-auto md:right-20 md:max-w-sm z-50 rounded-2xl bg-[#1A1A1A] text-white px-4 py-3 text-sm font-semibold shadow-xl print:hidden"
                >
                    Tocca per attivare i suoni (messaggi, ordini, foto)
                </button>
            ) : null}
            <button
                type="button"
                onClick={toggleMuted}
                className="fixed bottom-4 right-4 z-50 md:bottom-6 md:right-6 w-11 h-11 rounded-full bg-white border border-gray-200 shadow-lg flex items-center justify-center hover:bg-gray-50 print:hidden"
                aria-label={muted ? 'Attiva suoni dashboard' : 'Disattiva suoni dashboard'}
                title={
                    muted
                        ? 'Suoni disattivati — messaggi, ordini, foto'
                        : 'Suoni attivi — messaggi WhatsApp, ordini, foto fioristi'
                }
            >
                {muted ? (
                    <VolumeX className="w-5 h-5 text-gray-500" />
                ) : (
                    <Volume2 className="w-5 h-5 text-[#C0A062]" />
                )}
            </button>
        </>
    );
}
