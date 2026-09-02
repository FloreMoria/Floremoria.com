'use client';

import useSWR, { type SWRConfiguration, type Key } from 'swr';
import {
    DASHBOARD_LIVE_INTERVAL_MS,
    type DashboardLiveTier,
} from '@/lib/dashboard/liveDataConfig';
import { useDashboardLiveSync } from '@/components/dashboard/DashboardLiveProvider';

export async function dashboardJsonFetcher<T = unknown>(url: string): Promise<T> {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        throw err;
    }
    return (await res.json()) as T;
}

/**
 * Hook live tipizzato: polling per tier + focus/reconnect ereditati dal provider.
 */
export function useDashboardLive<T>(
    key: Key,
    fetcher: ((key: string) => Promise<T>) | null,
    tier: DashboardLiveTier,
    options?: SWRConfiguration<T>
) {
    const { markSynced, tierInterval } = useDashboardLiveSync();
    const refreshInterval = options?.refreshInterval ?? tierInterval(tier);

    return useSWR<T>(key, fetcher as (key: string) => Promise<T>, {
        refreshInterval,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        keepPreviousData: true,
        ...options,
        onSuccess: (data, k, config) => {
            markSynced();
            options?.onSuccess?.(data, k, config);
        },
    });
}

export { DASHBOARD_LIVE_INTERVAL_MS };
