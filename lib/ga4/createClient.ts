import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { OAuth2Client } from 'google-auth-library';
import { getGa4PropertyId } from '@/lib/ga4/config';
import { getGa4OAuthCredentials, getGa4ServiceAccountCredentials } from '@/lib/ga4/credentials';

/** Client API GA4: service account (preferito) oppure OAuth Gmail staff. */
export function createGa4DataClient(): BetaAnalyticsDataClient | null {
    if (!getGa4PropertyId()) {
        return null;
    }

    const serviceAccount = getGa4ServiceAccountCredentials();
    if (serviceAccount) {
        return new BetaAnalyticsDataClient({ credentials: serviceAccount });
    }

    const oauth = getGa4OAuthCredentials();
    if (oauth) {
        const authClient = new OAuth2Client(oauth.clientId, oauth.clientSecret);
        authClient.setCredentials({ refresh_token: oauth.refreshToken });
        return new BetaAnalyticsDataClient({ authClient });
    }

    return null;
}
