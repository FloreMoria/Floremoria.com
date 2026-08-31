/**
 * Risoluzione URL SOAP YouDOX/DocuMI.
 * Priorità: YOUDOX_INVOICES_SERVICE_URL → sibling GetToken.aspx → path WCF standard.
 */
import type { YoudoxConfig } from './types';

function trimUrl(url: string): string {
    return url.trim().replace(/\/$/, '');
}

/** Allinea apiBaseUrl al path /api quando GetToken.aspx è sotto .../api/. */
export function normalizeYoudoxApiBaseUrl(apiBaseUrl: string, tokenUrl: string): string {
    const base = trimUrl(apiBaseUrl);
    const token = trimUrl(tokenUrl);
    const fromToken = token.match(/^(.*\/api)\/GetToken\.aspx$/i);
    if (fromToken) {
        return fromToken[1];
    }
    if (/\/fatturazione$/i.test(base)) {
        return `${base}/api`;
    }
    return base;
}

function pushUnique(list: string[], url?: string | null): void {
    if (!url) return;
    const normalized = trimUrl(url);
    if (!normalized || list.includes(normalized)) return;
    list.push(normalized);
}

/**
 * Candidati InvoicesService in ordine di priorità.
 * Se YOUDOX_INVOICES_SERVICE_URL è impostata, usa solo quella.
 */
export function resolveInvoicesServiceCandidates(config: YoudoxConfig): string[] {
    const explicit = config.invoicesServiceUrl?.trim();
    if (explicit) {
        return [trimUrl(explicit)];
    }

    const apiBase = trimUrl(config.apiBaseUrl);
    const fattRoot = apiBase.replace(/\/api$/i, '');
    const tokenBase = trimUrl(config.tokenUrl).replace(/\/GetToken\.aspx$/i, '');

    const candidates: string[] = [];

    // Stesso folder di GetToken.aspx (auth OK → path più affidabile).
    pushUnique(candidates, `${tokenBase}/InvoicesService.svc`);

    // WCF standard DocuMI.
    pushUnique(candidates, `${apiBase}/InvoicesService.svc`);
    pushUnique(candidates, `${fattRoot}/api/InvoicesService.svc`);
    pushUnique(candidates, `${fattRoot}/InvoicesService.svc`);

    // Installazioni legacy ASMX (fallback solo su 404 WCF).
    pushUnique(candidates, `${fattRoot}/Services/DocumiWS.asmx`);
    pushUnique(candidates, `${fattRoot}/DocumiWS.asmx`);
    pushUnique(candidates, `${apiBase}/Services/DocumiWS.asmx`);

    return candidates;
}

/** Primo candidato (diagnostica / health). */
export function invoicesServiceEndpoint(config: YoudoxConfig): string {
    return resolveInvoicesServiceCandidates(config)[0];
}
