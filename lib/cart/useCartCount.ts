'use client';

import { useCallback, useEffect, useState } from 'react';

const CART_STORAGE_KEY = 'fm_cart';

function readCartCount(): number {
    if (typeof window === 'undefined') return 0;
    try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        if (!raw) return 0;
        const items = JSON.parse(raw) as { qty?: number }[];
        if (!Array.isArray(items)) return 0;
        return items.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
    } catch {
        return 0;
    }
}

/** Contatore badge carrello — sincronizzato con fm_cart e evento custom cart-added. */
export function useCartCount(): number {
    const [count, setCount] = useState(0);

    const refresh = useCallback(() => {
        setCount(readCartCount());
    }, []);

    useEffect(() => {
        refresh();
        const onStorage = (e: StorageEvent) => {
            if (e.key === CART_STORAGE_KEY) refresh();
        };
        const onCartAdded = () => refresh();
        window.addEventListener('storage', onStorage);
        window.addEventListener('cart-added', onCartAdded);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('cart-added', onCartAdded);
        };
    }, [refresh]);

    return count;
}
