/**
 * Intervalli live dashboard — gerarchia per criticità operativa.
 * Perché: chat/foto devono essere quasi real-time; fiscalità può pollare più lento.
 */

export type DashboardLiveTier = 'chat' | 'ops' | 'finance' | 'metrics';

/** Millisecondi tra revalidate automatici (SWR refreshInterval). */
export const DASHBOARD_LIVE_INTERVAL_MS: Record<DashboardLiveTier, number> = {
    /** WhatsApp / VERA / foto posa */
    chat: 4_000,
    /** Ordini, defunti, fioristi, mission control */
    ops: 12_000,
    /** Prima Nota, dossier, riconciliazione */
    finance: 45_000,
    /** GA4 / overview KPI */
    metrics: 60_000,
};

/**
 * Soft router.refresh() per pagine RSC (Ordini, Defunti, …).
 * `0` = skip: la pagina è già coperta da SWR client (evita doppio carico).
 */
export const DASHBOARD_SOFT_REFRESH_MS: Record<string, number> = {
    '/dashboard/communications': 0,
    '/dashboard/finance': 0,
    '/dashboard/orders': DASHBOARD_LIVE_INTERVAL_MS.ops,
    '/dashboard/defunti': DASHBOARD_LIVE_INTERVAL_MS.ops,
    '/dashboard/fioristi': DASHBOARD_LIVE_INTERVAL_MS.ops,
    '/dashboard/agenzie': DASHBOARD_LIVE_INTERVAL_MS.ops,
    '/dashboard/users': DASHBOARD_LIVE_INTERVAL_MS.ops,
    '/dashboard': DASHBOARD_LIVE_INTERVAL_MS.ops,
    '/dashboard/logs': DASHBOARD_LIVE_INTERVAL_MS.ops,
    '/dashboard/campaigns': DASHBOARD_LIVE_INTERVAL_MS.metrics,
};

export function softRefreshIntervalForPath(pathname: string): number {
    const exact = DASHBOARD_SOFT_REFRESH_MS[pathname];
    if (exact !== undefined) return exact;
    // Client-heavy hubs già su SWR
    if (pathname.startsWith('/dashboard/communications')) return 0;
    if (pathname.startsWith('/dashboard/finance')) return 0;
    if (pathname.startsWith('/dashboard/orders')) return DASHBOARD_LIVE_INTERVAL_MS.ops;
    if (pathname.startsWith('/dashboard/defunti')) return DASHBOARD_LIVE_INTERVAL_MS.ops;
    if (pathname.startsWith('/dashboard/fioristi')) return DASHBOARD_LIVE_INTERVAL_MS.ops;
    if (pathname.startsWith('/dashboard')) return DASHBOARD_LIVE_INTERVAL_MS.ops;
    return DASHBOARD_LIVE_INTERVAL_MS.ops;
}
