import { NextRequest, NextResponse } from 'next/server';
import {
    buildPinterestBasicAuthHeader,
    getPinterestAppId,
    getPinterestAppSecret,
    getPinterestRedirectUri,
} from '@/lib/pinterest/oauth';
import { exchangePinterestAuthorizationCode } from '@/src/agents/platforms/pinterestTokenService';

export const runtime = 'nodejs';

function campaignsRedirect(request: NextRequest, query: string): NextResponse {
    const base = new URL(request.url);
    base.pathname = '/dashboard/campaigns';
    base.search = query;
    return NextResponse.redirect(base);
}

/**
 * GET /api/auth/pinterest/callback
 * Scambia code → access_token + refresh_token (continuous refresh) e salva in SystemState.
 * Se demo=true (in query o in state), mostra la schermata HTML/JSON per la registrazione del Video Demo OAuth.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const state = searchParams.get('state') || '';
    const isDemo = searchParams.get('demo') === 'true' || state.includes('demo');

    if (error) {
        console.error(`[Pinterest Callback] Errore OAuth: ${error} — ${errorDescription}`);
        if (isDemo) {
            return NextResponse.json(
                { ok: false, error, errorDescription },
                { status: 400 }
            );
        }
        return campaignsRedirect(
            request,
            `tab=PINTEREST&error=${encodeURIComponent(errorDescription || error)}`
        );
    }

    if (!code?.trim()) {
        if (isDemo) {
            return NextResponse.json(
                { ok: false, error: 'No authorization code received' },
                { status: 400 }
            );
        }
        return campaignsRedirect(request, 'tab=PINTEREST&error=no-code');
    }

    const trimmedCode = code.trim();
    const redirectUri = getPinterestRedirectUri(request);
    const appId = getPinterestAppId() || 'YOUR_PINTEREST_APP_ID';
    const appSecret = getPinterestAppSecret() || 'YOUR_PINTEREST_APP_SECRET';
    const authHeader = buildPinterestBasicAuthHeader(appId, appSecret);

    const curlCommand = `curl -i -X POST "https://api.pinterest.com/v5/oauth/token" \\
  -H "Authorization: ${authHeader}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=authorization_code" \\
  -d "code=${trimmedCode}" \\
  -d "redirect_uri=${redirectUri}"`;

    if (isDemo) {
        let exchangeStatus = 'In attesa o non eseguito';
        try {
            await exchangePinterestAuthorizationCode({
                code: trimmedCode,
                redirectUri,
            });
            exchangeStatus = '✅ Token scambiato e salvato in SystemState con successo!';
        } catch (e) {
            exchangeStatus = `⚠️ Scambio token automatico: ${e instanceof Error ? e.message : String(e)}`;
        }

        if (searchParams.get('format') === 'json') {
            return NextResponse.json({
                ok: true,
                demo: true,
                code: trimmedCode,
                authHeader,
                curlCommand,
                redirectUri,
                appId,
                exchangeStatus,
            });
        }

        const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pinterest OAuth Demo — Authorization Code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; margin: 0; }
    .card { max-width: 850px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { color: #e60023; margin-top: 0; font-size: 1.75rem; display: flex; align-items: center; gap: 0.5rem; }
    h2 { font-size: 1.05rem; color: #94a3b8; margin-top: 1.5rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
    pre { background: #090d16; padding: 1rem; border-radius: 8px; border: 1px solid #334155; overflow-x: auto; color: #38bdf8; font-size: 0.88rem; word-break: break-all; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .code-val { color: #4ade80; font-weight: bold; }
    .status-badge { background: rgba(74, 222, 128, 0.1); border: 1px solid #4ade80; color: #4ade80; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .btn { display: inline-block; background: #e60023; color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.95rem; text-decoration: none; margin-top: 1rem; }
    .btn:hover { background: #ad081b; }
    .info { background: rgba(56, 189, 248, 0.1); border-left: 4px solid #38bdf8; padding: 0.75rem 1rem; border-radius: 4px; margin: 1rem 0; color: #cbd5e1; font-size: 0.95rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
    .grid-item { background: #0f172a; padding: 0.75rem; border-radius: 6px; font-size: 0.85rem; border: 1px solid #1e293b; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📌 Pinterest OAuth Demo Mode</h1>
    <div class="info">
      Pagina di verifica OAuth v5 per la registrazione del Video Demo di App Review.
    </div>

    <div class="status-badge">${exchangeStatus}</div>

    <h2>1. Codice "code" ricevuto da Pinterest:</h2>
    <pre class="code-val">${trimmedCode}</pre>

    <h2>2. Intestazione Authorization Basic (Base64):</h2>
    <pre>${authHeader}</pre>

    <h2>3. Chiamata cURL Completa per il Terminale:</h2>
    <pre>${curlCommand}</pre>

    <h2>Dettagli Parametri OAuth:</h2>
    <div class="grid">
      <div class="grid-item"><strong>Client ID (App ID):</strong> ${appId}</div>
      <div class="grid-item"><strong>Grant Type:</strong> authorization_code</div>
      <div class="grid-item" style="grid-column: span 2;"><strong>Redirect URI:</strong> ${redirectUri}</div>
    </div>

    <div style="margin-top: 2rem;">
      <a href="/dashboard/campaigns?tab=PINTEREST" class="btn">Vai alla Dashboard Campaigns →</a>
    </div>
  </div>
</body>
</html>`;

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    try {
        console.log('[Pinterest Callback] Scambio authorization code…');
        await exchangePinterestAuthorizationCode({
            code: trimmedCode,
            redirectUri,
        });
        console.log('[Pinterest Callback] Token salvati in SystemState.');
        return campaignsRedirect(request, 'tab=PINTEREST&success=pinterest-connected');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Pinterest Callback] Eccezione:', msg);
        return campaignsRedirect(
            request,
            `tab=PINTEREST&error=${encodeURIComponent(msg)}`
        );
    }
}
