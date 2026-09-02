'use client';

import { useEffect, useState } from 'react';
import { useDashboardLiveSync } from '@/components/dashboard/DashboardLiveProvider';

function formatSyncTime(ts: number | null): string {
    if (!ts) return 'in avvio…';
    try {
        return new Intl.DateTimeFormat('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'Europe/Rome',
        }).format(new Date(ts));
    } catch {
        return new Date(ts).toLocaleTimeString('it-IT');
    }
}

/** Badge discreto in header: Live + orario ultima sincronizzazione. */
export default function DashboardLiveBadge() {
    const { lastSyncedAt } = useDashboardLiveSync();
    const [, setTick] = useState(0);

    useEffect(() => {
        const id = window.setInterval(() => setTick((n) => n + 1), 1000);
        return () => window.clearInterval(id);
    }, []);

    const ageSec = lastSyncedAt ? Math.max(0, Math.floor((Date.now() - lastSyncedAt) / 1000)) : null;
    const fresh = ageSec != null && ageSec < 20;

    return (
        <div
            className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50/80 px-2.5 py-1"
            title="Dati aggiornati automaticamente in background — nessun refresh pagina"
        >
            <span className="relative flex h-2 w-2">
                <span
                    className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${
                        fresh ? 'animate-ping' : ''
                    }`}
                />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[11px] font-semibold text-emerald-800 tracking-tight">
                Live
            </span>
            <span className="text-[10px] text-emerald-700/80 tabular-nums">
                {formatSyncTime(lastSyncedAt)}
            </span>
        </div>
    );
}
