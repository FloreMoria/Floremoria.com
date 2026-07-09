import { useEffect } from 'react';

const EDGE_ZONE_PX = 36;
const MIN_SWIPE_PX = 64;
const MAX_VERTICAL_DRIFT_PX = 96;

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
export function useEdgeSwipeBack(onBack: () => void, enabled = true): void {
    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let startX = 0;
        let startY = 0;
        let tracking = false;

        const onTouchStart = (event: TouchEvent) => {
            if (isDashboardOverlayOpen()) return;
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

        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchend', onTouchEnd, { passive: true });
        window.addEventListener('touchcancel', onTouchCancel, { passive: true });

        return () => {
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('touchend', onTouchEnd);
            window.removeEventListener('touchcancel', onTouchCancel);
        };
    }, [enabled, onBack]);
}
