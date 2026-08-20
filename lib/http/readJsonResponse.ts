/**
 * Parse sicuro di risposte fetch: evita "Unexpected token '<'" su HTML di errore/login.
 */
export async function readJsonResponse<T = Record<string, unknown>>(
    res: Response
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null; rawText: string }> {
    const rawText = await res.text();
    const trimmed = rawText.trim();

    if (!trimmed) {
        return {
            ok: res.ok,
            status: res.status,
            data: null,
            error: res.ok ? null : `Risposta vuota (HTTP ${res.status})`,
            rawText,
        };
    }

    if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype')) {
        return {
            ok: false,
            status: res.status,
            data: null,
            error:
                res.status === 401 || res.status === 403
                    ? 'Sessione scaduta o non autorizzato. Ricarica e accedi di nuovo.'
                    : `Il server ha restituito una pagina HTML invece di JSON (HTTP ${res.status}). Verifica che la route API sia deployata e che la sessione sia valida.`,
            rawText: trimmed.slice(0, 200),
        };
    }

    try {
        const data = JSON.parse(trimmed) as T;
        const errMsg =
            data && typeof data === 'object' && 'error' in data
                ? String((data as { error?: unknown }).error || '')
                : '';
        return {
            ok: res.ok && (data as { ok?: boolean })?.ok !== false,
            status: res.status,
            data,
            error: res.ok ? (errMsg || null) : errMsg || `Errore HTTP ${res.status}`,
            rawText,
        };
    } catch {
        return {
            ok: false,
            status: res.status,
            data: null,
            error: `Risposta non JSON (HTTP ${res.status}): ${trimmed.slice(0, 120)}`,
            rawText: trimmed.slice(0, 200),
        };
    }
}
