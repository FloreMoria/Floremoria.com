'use client';

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { SWRConfig } from 'swr';
import type { DashboardLiveTier } from '@/lib/dashboard/liveDataConfig';
import { DASHBOARD_LIVE_INTERVAL_MS } from '@/lib/dashboard/liveDataConfig';

type LiveSyncContextValue = {
    lastSyncedAt: number | null;
    markSynced: () => void;
    tierInterval: (tier: DashboardLiveTier) => number;
};

const LiveSyncContext = createContext<LiveSyncContextValue>({
    lastSyncedAt: null,
    markSynced: () => undefined,
    tierInterval: (tier) => DASHBOARD_LIVE_INTERVAL_MS[tier],
});

export function useDashboardLiveSync() {
    return useContext(LiveSyncContext);
}

/**
 * Provider SWR globale dashboard: focus/reconnect + tracking ultima sync.
 * I fetch periodici non devono montare spinner full-page (keepPreviousData via SWR).
 */
export default function DashboardLiveProvider({ children }: { children: ReactNode }) {
    const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

    const markSynced = useCallback(() => {
        setLastSyncedAt(Date.now());
    }, []);

    const tierInterval = useCallback((tier: DashboardLiveTier) => {
        return DASHBOARD_LIVE_INTERVAL_MS[tier];
    }, []);

    const value = useMemo(
        () => ({ lastSyncedAt, markSynced, tierInterval }),
        [lastSyncedAt, markSynced, tierInterval]
    );

    return (
        <LiveSyncContext.Provider value={value}>
            <SWRConfig
                value={{
                    revalidateOnFocus: true,
                    revalidateOnReconnect: true,
                    shouldRetryOnError: true,
                    errorRetryCount: 2,
                    keepPreviousData: true,
                    onSuccess: () => {
                        markSynced();
                    },
                }}
            >
                {children}
            </SWRConfig>
        </LiveSyncContext.Provider>
    );
}
