/**
 * Verifica connessione API GA4 per la dashboard Overview.
 * Uso: npm run ga4:verify
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';
import { getGa4PropertyId, GA4_MEASUREMENT_ID } from '../lib/ga4/config';
import {
    getGa4OAuthCredentials,
    getGa4ServiceAccountCredentials,
    isGa4ApiConfigured,
} from '../lib/ga4/credentials';
import { fetchGa4OverviewResult } from '../lib/ga4/fetchOverview';

loadEnvFiles();

async function main() {
    console.log('── Verifica GA4 Dashboard API ──\n');
    console.log('Tag sito (measurement):', GA4_MEASUREMENT_ID || '(mancante)');
    console.log('GA4_PROPERTY_ID:', getGa4PropertyId() || '(mancante)');

    const sa = getGa4ServiceAccountCredentials();
    const oauth = getGa4OAuthCredentials();
    if (!sa && !oauth) {
        console.error('\n✗ Nessuna credenziale API.');
        console.error('  Service account: npm run ga4:setup -- /percorso/chiave.json');
        console.error('  Oppure OAuth Gmail:  npm run ga4:oauth-setup -- /percorso/client_secret.json\n');
        process.exit(1);
    }
    if (sa) console.log('Service account:', sa.client_email);
    if (oauth) console.log('OAuth: refresh token configurato (Gmail staff)');

    if (!isGa4ApiConfigured()) {
        console.error('\n✗ Config incompleta (manca GA4_PROPERTY_ID o credenziali valide).\n');
        process.exit(1);
    }

    console.log('\nChiamata API in corso…');
    const overview = await fetchGa4OverviewResult({ bypassCache: true });
    const data = overview.data;

    if (overview.status === 'config_missing') {
        console.error('\n✗ Config GA4 incompleta.');
        process.exit(1);
    }

    if (overview.status === 'auth_error' || overview.status === 'api_error' || !data) {
        console.error('\n✗ API fallita. Controlla:');
        console.error(`  Diagnostica: ${overview.diagnosticCode}`);
        console.error('  1) GA4_PROPERTY_ID = ID proprietà (Admin → Impostazioni proprietà)');
        console.error('  2) GA4 → Amministrazione → Collegamenti GCP → collega progetto floremoria-com');
        console.error('  3) Cloud IAM → assistenza@... → ruolo "Visualizzatore Google Analytics"');
        console.error('     (NON usare "Aggiungi utenti" in GA4: rifiuta le email @iam.gserviceaccount.com)');
        console.error('  4) API "Google Analytics Data API" abilitata su Google Cloud\n');
        process.exit(1);
    }

    if (overview.status === 'empty' || data.isEmpty) {
        console.log('\n⚠ API ok ma nessun traffico negli ultimi 7 giorni (normale se il tag è appena attivo).');
    } else {
        console.log('\n✓ API ok — dati ricevuti:');
        console.log('  Utenti (7 gg):', data.totals.users);
        console.log('  Sessioni (7 gg):', data.totals.sessions);
        console.log('  Top pagine:', data.topPages.length);
    }
    console.log('');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
