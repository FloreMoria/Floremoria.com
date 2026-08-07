/**
 * Client diagnostico Gemini/Veo — risoluzione chiavi API + classificazione errori.
 * Usato da Reel Ziggy e dalla rotta generate-ziggy-reel.
 */

export const MISSING_VEO_API_KEY_MESSAGE =
  "Chiave API Gemini/Veo non trovata nelle variabili d'ambiente di Vercel.";

/** Ordine di risoluzione richiesto (Command Center / Vercel). */
const API_KEY_ENV_CANDIDATES = [
  'GEMINI_API_KEY',
  'GOOGLE_AI_STUDIO_API_KEY',
  'GOOGLE_API_KEY',
] as const;

export type VeoErrorKind =
  | 'missing_api_key'
  | 'authentication'
  | 'model_not_found_or_permission'
  | 'rate_limit'
  | 'unknown';

export type ClassifiedVeoError = {
  kind: VeoErrorKind;
  /** Messaggio chiaro per UI / JSON API. */
  error: string;
  /** Messaggio esatto SDK/API Google. */
  detail: string;
  /** HTTP status consigliato per la risposta Next. */
  httpStatus: number;
  /** Status upstream se noto (401/403/404/429…). */
  upstreamStatus?: number;
};

/**
 * Cerca la chiave Gemini/Veo in process.env nell'ordine ufficiale.
 * Fallback compat: GOOGLE_GENERATIVE_AI_API_KEY (storico repo).
 */
export function resolveGeminiVeoApiKey(): string | null {
  for (const name of API_KEY_ENV_CANDIDATES) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  const legacy = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  return legacy || null;
}

export function requireGeminiVeoApiKey(): string {
  const key = resolveGeminiVeoApiKey();
  if (!key) {
    throw new Error(MISSING_VEO_API_KEY_MESSAGE);
  }
  return key;
}

function extractUpstreamStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const o = err as Record<string, unknown>;
  if (typeof o.status === 'number' && Number.isFinite(o.status)) return o.status;
  if (typeof o.statusCode === 'number' && Number.isFinite(o.statusCode)) {
    return o.statusCode;
  }
  if (typeof o.code === 'number' && o.code >= 400 && o.code < 600) return o.code;
  const nested = o.error;
  if (nested && typeof nested === 'object') {
    const n = nested as Record<string, unknown>;
    if (typeof n.code === 'number' && n.code >= 400 && n.code < 600) return n.code;
    if (typeof n.status === 'number') return n.status;
  }
  return undefined;
}

function extractExactMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === 'string' && err.trim()) return err.trim();
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Classifica errori Veo/Gemini per diagnostica Command Center.
 * Distingue auth, modello/permessi, rate limit/quota.
 */
export function classifyVeoError(err: unknown): ClassifiedVeoError {
  const detail = extractExactMessage(err);
  const lower = detail.toLowerCase();
  const upstreamStatus = extractUpstreamStatus(err);

  if (
    detail.includes(MISSING_VEO_API_KEY_MESSAGE) ||
    /chiave api gemini\/veo non trovata/i.test(detail) ||
    /GEMINI_API_KEY mancante/i.test(detail)
  ) {
    return {
      kind: 'missing_api_key',
      error: MISSING_VEO_API_KEY_MESSAGE,
      detail,
      httpStatus: 503,
    };
  }

  const looksRateLimit =
    upstreamStatus === 429 ||
    /\b429\b/.test(detail) ||
    /resource.?exhausted/i.test(detail) ||
    /rate.?limit/i.test(detail) ||
    /quota.?exceeded/i.test(detail) ||
    /too many requests/i.test(lower);

  if (looksRateLimit) {
    return {
      kind: 'rate_limit',
      error:
        'Rate limit / quota Veo superata (429). Attendi qualche minuto prima di riprovare.',
      detail,
      httpStatus: 429,
      upstreamStatus: upstreamStatus ?? 429,
    };
  }

  const looksAuth =
    upstreamStatus === 401 ||
    /api[_ ]?key.*(invalid|expired|missing|not found)/i.test(detail) ||
    /invalid.?api.?key/i.test(detail) ||
    /unauthenticated/i.test(detail) ||
    /unauthorized/i.test(detail) ||
    /\b401\b/.test(detail);

  const looksModelOrPermission =
    upstreamStatus === 404 ||
    /model.+not.?found/i.test(detail) ||
    /not.?found.+model/i.test(detail) ||
    /permission.?denied/i.test(detail) ||
    /PERMISSION_DENIED/.test(detail) ||
    /NOT_FOUND/.test(detail) ||
    /does not have access/i.test(detail) ||
    /not (?:enabled|available|supported).*(?:veo|video)/i.test(detail) ||
    /(?:veo|video).*(?:not enabled|requires|permission)/i.test(detail) ||
    /Publisher Model/i.test(detail);

  // 403: auth se chiave invalida, altrimenti tipicamente modello/abilitazione progetto.
  if (upstreamStatus === 403 || /\b403\b/.test(detail)) {
    if (looksAuth && !looksModelOrPermission) {
      return {
        kind: 'authentication',
        error:
          'Autenticazione Gemini/Veo fallita (401/403): chiave API non valida o non autorizzata.',
        detail,
        httpStatus: 403,
        upstreamStatus: 403,
      };
    }
    return {
      kind: 'model_not_found_or_permission',
      error:
        'Modello Veo non disponibile o Permission Denied: richiede abilitazione specifica sul progetto Google Cloud / AI Studio.',
      detail,
      httpStatus: 403,
      upstreamStatus: upstreamStatus ?? 403,
    };
  }

  if (looksAuth) {
    return {
      kind: 'authentication',
      error:
        'Autenticazione Gemini/Veo fallita (401/403): chiave API non valida o non autorizzata.',
      detail,
      httpStatus: 401,
      upstreamStatus: upstreamStatus ?? 401,
    };
  }

  if (looksModelOrPermission) {
    return {
      kind: 'model_not_found_or_permission',
      error:
        'Modello Veo non trovato o Permission Denied: verifica MARKETING_VEO_MODEL e abilitazione Veo sul progetto Google.',
      detail,
      httpStatus: 404,
      upstreamStatus: upstreamStatus ?? 404,
    };
  }

  return {
    kind: 'unknown',
    error: detail || 'Errore generazione Reel Ziggy/Veo.',
    detail,
    httpStatus: 500,
    upstreamStatus,
  };
}
