'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { softRefreshIntervalForPath } from '@/lib/dashboard/liveDataConfig';
import { useDashboardLiveSync } from '@/components/dashboard/DashboardLiveProvider';

/**
 * Soft refresh RSC: riallinea props server (ordini, defunti, …) senza full reload
 * né reset scroll aggressivo. Pausa quando la scheda è nascosta.
 */
export default function DashboardSoftRefresh() {
    const pathname = usePathname() || '/dashboard';
    const router = useRouter();
    const { markSynced } = useDashboardLiveSync();
    const refreshingRef = useRef(false);

    useEffect(() => {
        const intervalMs = softRefreshIntervalForPath(pathname);
        // 0 = pagina già gestita da SWR (chat/finance): niente router.refresh doppio
        if (!intervalMs || intervalMs <= 0) return;

        let cancelled = false;

        const tick = () => {
            if (cancelled || (typeof document !== 'undefined' && document.hidden)) return;
            if (refreshingRef.current) return;
            refreshingRef.current = true;
            try {
                router.refresh();
                markSynced();
            } finally {
                // Debounce breve: evita refresh sovrapposti su reti lente
                window.setTimeout(() => {
                    refreshingRef.current = false;
                }, 800);
            }
        };

        const id = window.setInterval(tick, intervalMs);
        const onFocus = () => tick();
        const onVis = () => {
            if (!document.hidden) tick();
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVis);

        return () => {
            cancelled = true;
            window.clearInterval(id);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [pathname, router, markSynced]);

    return null;
}
