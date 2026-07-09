import { useEffect } from 'react';

const EDGE_ZONE_PX = 48;
const MIN_SWIPE_PX = 56;
const MAX_VERTICAL_DRIFT_PX = 100;

export interface EdgeSwipeBackOptions {
    /** Consente lo swipe anche con overlay aperto (es. lightbox foto). */
    allowWhenOverlayOpen?: boolean;
}

export function setDashboardOverlayOpen(open: boolean): void {
    if (typeof document === 'undefined') return;
    if (open) {
        document.body.dataset.dashboardOverlay = '1';
    } else {
        delete document.body.dataset.dashboardOverlay;
    }
}

export function isDashboardOverlayOpen(): boolean {
    if (typeof document === 'undefined') return false;
    return document.body.dataset.dashboardOverlay === '1';
}

/** Swipe da sinistra verso destra (bordo schermo) per azione indietro/chiudi. */
export function useEdgeSwipeBack(
    onBack: () => void,
    enabled = true,
    options: EdgeSwipeBackOptions = {}
): void {
    const allowWhenOverlayOpen = options.allowWhenOverlayOpen ?? false;

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let startX = 0;
        let startY = 0;
        let tracking = false;

        const onTouchStart = (event: TouchEvent) => {
            if (!allowWhenOverlayOpen && isDashboardOverlayOpen()) return;
            if (event.touches.length !== 1) return;
            const touch = event.touches[0];
            if (touch.clientX > EDGE_ZONE_PX) return;
            startX = touch.clientX;
            startY = touch.clientY;
            tracking = true;
        };

        const onTouchEnd = (event: TouchEvent) => {
            if (!tracking) return;
            tracking = false;
            const touch = event.changedTouches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = Math.abs(touch.clientY - startY);
            if (deltaX >= MIN_SWIPE_PX && deltaY <= MAX_VERTICAL_DRIFT_PX) {
                onBack();
            }
        };

        const onTouchCancel = () => {
            tracking = false;
        };

        document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
        document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
        document.addEventListener('touchcancel', onTouchCancel, { passive: true, capture: true });

        return () => {
            document.removeEventListener('touchstart', onTouchStart, true);
            document.removeEventListener('touchend', onTouchEnd, true);
            document.removeEventListener('touchcancel', onTouchCancel, true);
        };
    }, [allowWhenOverlayOpen, enabled, onBack]);
}
