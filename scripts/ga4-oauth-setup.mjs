#!/usr/bin/env node
/**
 * Collega GA4 alla dashboard usando la tua Gmail (staff), quando il service account
 * non può essere aggiunto in "Gestione accesso" Analytics.
 *
 * Prerequisito GCP → Credenziali → Client OAuth "Web":
 *   URI reindirizzamento autorizzato: http://localhost:3456/oauth2callback
 *
 * Uso:
 *   npm run ga4:oauth-setup -- ~/Downloads/client_secret_....json
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envLocalPath = resolve(root, '.env.local');
const REDIRECT_URI = 'http://localhost:3456/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];

const oauthJsonPath = process.argv[2];
if (!oauthJsonPath) {
    console.error(`
Uso: npm run ga4:oauth-setup -- /percorso/client_secret_....json

Prima in Google Cloud → Credenziali → il tuo client OAuth Web:
  Aggiungi URI reindirizzamento: ${REDIRECT_URI}
`);
    process.exit(1);
}

const raw = JSON.parse(readFileSync(resolve(oauthJsonPath), 'utf8'));
const web = raw.web || raw.installed;
if (!web?.client_id || !web?.client_secret) {
    console.error('File OAuth non valido (serve client_id e client_secret in .web)');
    process.exit(1);
}

const oauth2 = new OAuth2Client(web.client_id, web.client_secret, REDIRECT_URI);
const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
});

console.log('\n1) Apri questo URL nel browser (account staff.floremoria@gmail.com):\n');
console.log(authUrl);
console.log('\n2) Attendo il redirect su localhost:3456 …\n');

const server = createServer(async (req, res) => {
    if (!req.url?.startsWith('/oauth2callback')) {
        res.writeHead(404);
        res.end();
        return;
    }

    const url = new URL(req.url, 'http://localhost:3456');
    const code = url.searchParams.get('code');
    const err = url.searchParams.get('error');

    if (err || !code) {
        res.end('Errore autorizzazione. Chiudi questa scheda.');
        server.close();
        process.exit(1);
    }

    try {
        const { tokens } = await oauth2.getToken(code);
        if (!tokens.refresh_token) {
            res.end('Nessun refresh_token. Revoca accesso precedente in Google Account e riprova.');
            server.close();
            process.exit(1);
        }

        const lines = {
            GA4_OAUTH_CLIENT_ID: web.client_id,
            GA4_OAUTH_CLIENT_SECRET: web.client_secret,
            GA4_OAUTH_REFRESH_TOKEN: tokens.refresh_token,
        };

        let envContent = existsSync(envLocalPath) ? readFileSync(envLocalPath, 'utf8') : '';
        for (const [key, value] of Object.entries(lines)) {
            const line = `${key}="${value}"`;
            const re = new RegExp(`^${key}=.*$`, 'm');
            envContent = re.test(envContent) ? envContent.replace(re, line) : envContent + line + '\n';
        }
        writeFileSync(envLocalPath, envContent);

        res.end('OK! Refresh token salvato in .env.local. Chiudi e esegui: npm run ga4:verify');
        console.log('✓ Salvato in .env.local: GA4_OAUTH_CLIENT_ID, GA4_OAUTH_CLIENT_SECRET, GA4_OAUTH_REFRESH_TOKEN');
        console.log('\nSu Vercel aggiungi le stesse 3 variabili + GA4_PROPERTY_ID, poi redeploy.\n');
        console.log('npm run ga4:verify\n');
    } catch (e) {
        console.error(e);
        res.end('Errore. Vedi terminale.');
    } finally {
        setTimeout(() => {
            server.close();
            process.exit(0);
        }, 500);
    }
});

server.listen(3456, () => {
    import('node:child_process').then(({ exec }) => {
        exec(`open "${authUrl}"`);
    });
});
