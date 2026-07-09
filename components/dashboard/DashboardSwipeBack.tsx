'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useEdgeSwipeBack } from '@/lib/dashboard/useEdgeSwipeBack';

/** Gesto swipe da bordo sinistro → router.back() sulle pagine dashboard (mobile/PWA). */
export default function DashboardSwipeBack() {
    const router = useRouter();
    const pathname = usePathname() || '';

    const canGoBack =
        pathname.startsWith('/dashboard') &&
        pathname !== '/dashboard' &&
        pathname !== '/dashboard/user' &&
        !pathname.startsWith('/dashboard/communications');

    const handleBack = useCallback(() => {
        if (!canGoBack) return;
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
        }
    }, [canGoBack, router]);

    useEdgeSwipeBack(handleBack, canGoBack);

    return null;
}
