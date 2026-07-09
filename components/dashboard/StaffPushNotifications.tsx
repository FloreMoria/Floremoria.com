'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { unlockStaffAlertSounds } from '@/lib/dashboard/staffAlertSounds';

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
    const [state, setState] = useState<PushState>('idle');
    const [message, setMessage] = useState<string>('');
    const isLoading = state === 'loading';

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
                setState('enabled');
                setMessage('Notifiche push e suoni attivi su questo dispositivo.');
                unlockStaffAlertSounds();
                return;
            }
        }

        setState('idle');
        setMessage('Ricevi avvisi sonori e visivi per messaggi WhatsApp, nuovi ordini e foto fioristi.');
    }, []);

    useEffect(() => {
        void checkExisting();
    }, [checkExisting]);

    const enablePush = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setState('unsupported');
            return;
        }

        setState('loading');

        try {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') {
                setState('denied');
                setMessage('Permesso notifiche negato.');
                return;
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

            setState('enabled');
            setMessage('Notifiche push e suoni attivi. Aggiungi a Home per uso come app (PWA).');
            unlockStaffAlertSounds();
        } catch (err) {
            console.error('[staff-push]', err);
            setState('error');
            setMessage(err instanceof Error ? err.message : 'Errore attivazione push.');
        }
    };

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
            setState('idle');
            setMessage('Notifiche push disattivate su questo dispositivo.');
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
                        Disattiva
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => void enablePush()}
                        disabled={isLoading || state === 'denied'}
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
