import { GA4_MEASUREMENT_ID } from '@/lib/ga4/config';
import { isGa4ApiConfigured } from '@/lib/ga4/credentials';

export type Ga4HealthState = 'green' | 'yellow' | 'red';

/** Stato per Mission Control: API ok / solo tag sito / non configurato. */
export function getGa4HealthState(): Ga4HealthState {
    if (isGa4ApiConfigured()) {
        return 'green';
    }
    if (GA4_MEASUREMENT_ID) {
        return 'yellow';
    }
    return 'red';
}
