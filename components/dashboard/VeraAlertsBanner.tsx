'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, MapPin, Loader2, ChevronRight, X } from 'lucide-react';

export type VeraAlertType =
    | 'grave_position_missing'
    | 'tomb_not_found'
    | 'cemetery_closed'
    | 'user_modification_request'
    | 'workflow_blocked'
    | 'listino_missing'
    | 'florist_whatsapp_missing'
    | 'punto_a_send_failed'
    | 'economic_discrepancy';

export interface VeraOperationalAlert {
    id: string;
    orderNumber: string | null;
    deceasedName: string;
    buyerFullName: string | null;
    veraAlertType: VeraAlertType | string;
    veraAlertMessage: string | null;
    veraAlertAt: string | null;
    veraAlertPriority: string | null;
    orderFrozenAt: string | null;
    partner: { shopName: string } | null;
}

interface VeraAlertsBannerProps {
    /** Incrementa per forzare il refresh (es. dopo salvataggio ordine in drawer). */
    refreshKey?: number;
    onOpenOrder?: (orderId: string) => void;
    onAlertsChange?: (count: number) => void;
    onGravePositionSaved?: (orderId: string, gravePosition: string) => void;
}

function orderLabel(alert: VeraOperationalAlert): string {
    return alert.orderNumber || alert.id.slice(-6).toUpperCase();
}

const CRITICAL_TYPES = new Set<VeraAlertType>([
    'workflow_blocked',
    'florist_whatsapp_missing',
    'punto_a_send_failed',
]);
const OPERATIONAL_TYPES = new Set<VeraAlertType>([
    'grave_position_missing',
    'tomb_not_found',
    'cemetery_closed',
    'user_modification_request',
    'listino_missing',
    'economic_discrepancy',
]);

export default function VeraAlertsBanner({
    refreshKey = 0,
    onOpenOrder,
    onAlertsChange,
    onGravePositionSaved,
}: VeraAlertsBannerProps) {
    const [alerts, setAlerts] = useState<VeraOperationalAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [dismissed, setDismissed] = useState(false);
    const [draftPositions, setDraftPositions] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchAlerts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/vera-alerts', { cache: 'no-store' });
            if (!res.ok) throw new Error('Caricamento alert non riuscito.');
            const data = (await res.json()) as { alerts?: VeraOperationalAlert[] };
            const list = data.alerts ?? [];
            setAlerts(list);
            onAlertsChange?.(list.length);
            if (list.length === 0) setDismissed(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore caricamento alert.');
        } finally {
            setLoading(false);
        }
    }, [onAlertsChange]);

    useEffect(() => {
        void fetchAlerts();
    }, [fetchAlerts, refreshKey]);

    const saveGravePosition = async (alert: VeraOperationalAlert) => {
        const value = (draftPositions[alert.id] ?? '').trim();
        if (!value) {
            window.alert('Inserisca le indicazioni della tomba (settore, fila, numero).');
            return;
        }

        setSavingId(alert.id);
        try {
            const res = await fetch(`/api/dashboard/orders/${alert.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gravePosition: value }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.error || 'Salvataggio non riuscito.');
            }

            setDraftPositions((prev) => {
                const next = { ...prev };
                delete next[alert.id];
                return next;
            });
            onGravePositionSaved?.(alert.id, value);
            await fetchAlerts();
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'Errore durante lo sblocco.');
        } finally {
            setSavingId(null);
        }
    };

    if (loading && alerts.length === 0 && !error) {
        return null;
    }

    if (dismissed && alerts.length === 0) {
        return null;
    }

    if (!loading && alerts.length === 0 && !error) {
        return null;
    }

    const critical = alerts.filter((a) =>
        CRITICAL_TYPES.has(a.veraAlertType as VeraAlertType)
    );
    const operational = alerts.filter((a) =>
        OPERATIONAL_TYPES.has(a.veraAlertType as VeraAlertType)
    );

    return (
        <div className="space-y-3" role="region" aria-label="Alert operativi VERA">
            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                    {error}
                </div>
            ) : null}

            {critical.length > 0 ? (
                <div className="rounded-xl border-2 border-red-300 bg-red-50 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-600 px-4 py-2.5 text-white">
                        <div className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide">
                            <AlertTriangle size={18} className="shrink-0" />
                            Workflow VERA bloccato — {critical.length} ordine
                            {critical.length !== 1 ? 'i' : ''}
                        </div>
                    </div>
                    <ul className="divide-y divide-red-100">
                        {critical.map((alert) => (
                            <li key={alert.id} className="p-4 space-y-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="font-semibold text-red-950 text-sm">
                                            ⚠️ ATTENZIONE: Ordine{' '}
                                            <span className="font-mono">{orderLabel(alert)}</span>
                                            {alert.veraAlertType === 'grave_position_missing'
                                                ? ' — Mancano le indicazioni di consegna'
                                                : ' — Workflow VERA da verificare'}
                                        </p>
                                        {alert.veraAlertMessage ? (
                                            <p className="text-red-800/90 text-xs mt-1">{alert.veraAlertMessage}</p>
                                        ) : null}
                                        <p className="text-red-800/90 text-xs mt-1">
                                            {alert.deceasedName}
                                            {alert.partner?.shopName
                                                ? ` · Fiorista: ${alert.partner.shopName}`
                                                : ''}
                                        </p>
                                    </div>
                                    {onOpenOrder ? (
                                        <button
                                            type="button"
                                            onClick={() => onOpenOrder(alert.id)}
                                            className="text-xs font-semibold text-red-700 hover:text-red-900 flex items-center gap-1 shrink-0"
                                        >
                                            Apri ordine <ChevronRight size={14} />
                                        </button>
                                    ) : null}
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="relative flex-1">
                                        <MapPin
                                            size={16}
                                            className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400"
                                        />
                                        <input
                                            type="text"
                                            value={draftPositions[alert.id] ?? ''}
                                            onChange={(e) =>
                                                setDraftPositions((prev) => ({
                                                    ...prev,
                                                    [alert.id]: e.target.value,
                                                }))
                                            }
                                            placeholder="Es. Settore 4, fila 12, loculo 3"
                                            className="w-full pl-9 pr-3 py-2.5 text-sm border border-red-200 rounded-lg bg-white focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        disabled={savingId === alert.id}
                                        onClick={() => void saveGravePosition(alert)}
                                        className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-60 transition-colors"
                                    >
                                        {savingId === alert.id ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin" />
                                                Sblocco…
                                            </>
                                        ) : (
                                            'Salva e sblocca workflow'
                                        )}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {operational.length > 0 ? (
                <div className="rounded-xl border border-orange-300 bg-orange-50 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-orange-200 bg-orange-500 px-4 py-2.5 text-white">
                        <div className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide">
                            <AlertTriangle size={18} className="shrink-0" />
                            Intervento staff richiesto — {operational.length} segnalazione
                            {operational.length !== 1 ? 'i' : ''}
                        </div>
                        <button
                            type="button"
                            onClick={() => setDismissed(true)}
                            className="p-1 rounded hover:bg-orange-600/50"
                            aria-label="Nascondi banner"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <ul className="divide-y divide-orange-100">
                        {operational.map((alert) => {
                            const isTomb = alert.veraAlertType === 'tomb_not_found';
                            const isCemetery = alert.veraAlertType === 'cemetery_closed';
                            const title = isTomb
                                ? `Tomba non trovata — ordine ${orderLabel(alert)}`
                                : isCemetery
                                  ? `Cimitero chiuso — ordine ${orderLabel(alert)}`
                                  : `Richiesta modifica utente — ordine ${orderLabel(alert)}`;

                            return (
                                <li
                                    key={alert.id}
                                    className="p-4 flex flex-wrap items-center justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <p className="font-semibold text-orange-950 text-sm">{title}</p>
                                        <p className="text-orange-900/80 text-xs mt-0.5 truncate">
                                            {alert.veraAlertMessage || alert.deceasedName}
                                        </p>
                                    </div>
                                    {onOpenOrder ? (
                                        <button
                                            type="button"
                                            onClick={() => onOpenOrder(alert.id)}
                                            className="shrink-0 px-3 py-2 rounded-lg bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition-colors"
                                        >
                                            Gestisci ordine
                                        </button>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}
