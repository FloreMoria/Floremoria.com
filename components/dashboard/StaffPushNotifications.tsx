'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import {
    setStaffAlertSoundsMuted,
    unlockStaffAlertSounds,
} from '@/lib/dashboard/staffAlertSounds';

type PushState = 'unsupported' | 'idle' | 'loading' | 'enabled' | 'denied' | 'error';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) {
        output[i] = raw.charCodeAt(i);
    }
    return output;
}

export default function StaffPushNotifications() {
    const [state, setState] = useState<PushState>('loading');
    const [message, setMessage] = useState<string>('Attivazione notifiche e suoni in corso…');
    const autoEnableAttemptedRef = useRef(false);
    const isLoading = state === 'loading';

    const subscribeToPush = useCallback(async (): Promise<boolean> => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            return false;
        }

        const perm = Notification.permission;
        if (perm !== 'granted') {
            return false;
        }

        const vapidRes = await fetch('/api/dashboard/push/vapid-public-key');
        const vapidData = await vapidRes.json();
        if (!vapidRes.ok || !vapidData.publicKey) {
            throw new Error(vapidData.error || 'VAPID non disponibile.');
        }

        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey) as BufferSource,
            });
        }

        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
            throw new Error('Sottoscrizione push incompleta.');
        }

        const saveRes = await fetch('/api/dashboard/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                endpoint: json.endpoint,
                keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
            }),
        });

        if (!saveRes.ok) {
            const err = await saveRes.json().catch(() => ({}));
            throw new Error(err.error || 'Salvataggio sottoscrizione fallito.');
        }

        return true;
    }, []);

    const markEnabled = useCallback(() => {
        setStaffAlertSoundsMuted(false);
        unlockStaffAlertSounds();
        setState('enabled');
        setMessage('Notifiche push e suoni attivi su questo dispositivo.');
    }, []);

    const checkExisting = useCallback(async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setState('unsupported');
            setMessage('Browser non compatibile con Web Push.');
            return;
        }

        if (Notification.permission === 'denied') {
            setState('denied');
            setMessage('Notifiche bloccate nelle impostazioni del browser.');
            return;
        }

        const registration = await navigator.serviceWorker.getRegistration('/');
        if (registration) {
            const sub = await registration.pushManager.getSubscription();
            if (sub) {
                markEnabled();
                return;
            }
        }

        if (Notification.permission === 'granted') {
            try {
                await subscribeToPush();
                markEnabled();
                return;
            } catch (err) {
                console.error('[staff-push] auto subscribe', err);
            }
        }

        setState('idle');
        setMessage('Notifiche e suoni si attivano al primo tocco su questa pagina.');
    }, [markEnabled, subscribeToPush]);

    useEffect(() => {
        void checkExisting();
    }, [checkExisting]);

    const enablePush = useCallback(
        async (requestPermission = true) => {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                setState('unsupported');
                return;
            }

            setState('loading');

            try {
                if (requestPermission) {
                    const perm = await Notification.requestPermission();
                    if (perm !== 'granted') {
                        setState('denied');
                        setMessage('Permesso notifiche negato.');
                        return;
                    }
                } else if (Notification.permission !== 'granted') {
                    setState('idle');
                    setMessage('Tocca la pagina per consentire notifiche e suoni.');
                    return;
                }

                await subscribeToPush();
                markEnabled();
            } catch (err) {
                console.error('[staff-push]', err);
                setState('error');
                setMessage(err instanceof Error ? err.message : 'Errore attivazione push.');
            }
        },
        [markEnabled, subscribeToPush]
    );

    useEffect(() => {
        if (autoEnableAttemptedRef.current) return;
        if (state !== 'idle') return;

        const tryAutoEnable = () => {
            if (autoEnableAttemptedRef.current) return;
            autoEnableAttemptedRef.current = true;
            void enablePush(true);
        };

        window.addEventListener('pointerdown', tryAutoEnable, { once: true });
        return () => window.removeEventListener('pointerdown', tryAutoEnable);
    }, [enablePush, state]);

    const disablePush = async () => {
        setState('loading');
        try {
            const registration = await navigator.serviceWorker.getRegistration('/');
            const subscription = await registration?.pushManager.getSubscription();
            if (subscription) {
                const endpoint = subscription.endpoint;
                await fetch('/api/dashboard/push/subscribe', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint }),
                });
                await subscription.unsubscribe();
            }
            setStaffAlertSoundsMuted(true);
            setState('idle');
            setMessage('Notifiche push e suoni sospesi su questo dispositivo.');
        } catch (err) {
            setState('error');
            setMessage(err instanceof Error ? err.message : 'Errore disattivazione.');
        }
    };

    if (state === 'unsupported') {
        return (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-2">
                <BellOff className="w-4 h-4 shrink-0" />
                {message}
            </div>
        );
    }

    return (
        <div className="mb-6 rounded-2xl border border-[#EAE3D9] bg-[#FDFCF9] px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
                {state === 'enabled' ? (
                    <BellRing className="w-5 h-5 text-[#C0A062] mt-0.5 shrink-0" />
                ) : (
                    <Bell className="w-5 h-5 text-[#6F6F6F] mt-0.5 shrink-0" />
                )}
                <div>
                    <p className="font-semibold text-[#1A1A1A] text-sm">Notifiche push staff</p>
                    <p className="text-xs text-[#6F6F6F] mt-0.5">{message}</p>
                </div>
            </div>
            <div className="flex gap-2 shrink-0">
                {state === 'enabled' ? (
                    <button
                        type="button"
                        onClick={() => void disablePush()}
                        disabled={isLoading}
                        className="px-4 py-2 rounded-full text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-white transition-colors"
                    >
                        Sospendi
                    </button>
                ) : state === 'denied' ? (
                    <span className="px-4 py-2 text-xs text-gray-500">Abilita dalle impostazioni browser</span>
                ) : (
                    <button
                        type="button"
                        onClick={() => void enablePush(true)}
                        disabled={isLoading}
                        className="px-4 py-2 rounded-full text-xs font-semibold bg-[#C0A062] text-white hover:bg-[#B89F78] transition-colors flex items-center gap-2"
                    >
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Attiva notifiche
                    </button>
                )}
            </div>
        </div>
    );
}
