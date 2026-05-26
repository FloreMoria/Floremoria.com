import { GA4_MEASUREMENT_ID } from '@/lib/ga4/config';
import { fetchGa4OverviewResult } from '@/lib/ga4/fetchOverview';

export type Ga4HealthState = 'green' | 'yellow' | 'red';

/** Stato Mission Control: basato su fetch reale Data API, non solo env. */
export async function getGa4HealthState(): Promise<Ga4HealthState> {
    const ga4 = await fetchGa4OverviewResult({ cacheTtlMs: 5 * 60 * 1000 });

    if (ga4.status === 'ok' || ga4.status === 'empty') {
        return 'green';
    }
    if (ga4.status === 'config_missing') {
        return GA4_MEASUREMENT_ID ? 'yellow' : 'red';
    }
    if (ga4.status === 'auth_error') {
        return 'red';
    }
    return 'yellow';
}
