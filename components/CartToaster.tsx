'use client';

import React, { useState, useEffect } from 'react';

export default function CartToaster() {
    const [toast, setToast] = useState<{ id: string; name: string } | null>(null);

    useEffect(() => {
        const handleCartAdd = (e: CustomEvent) => {
            setToast({
                id: Math.random().toString(36).substring(7),
                name: e.detail.name,
            });
        };

        window.addEventListener('cart-added', handleCartAdd as EventListener);
        return () => window.removeEventListener('cart-added', handleCartAdd as EventListener);
    }, []);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => {
                setToast(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    if (!toast) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 bg-fm-text text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in-up md:right-10 md:bottom-10 pointer-events-none">
            <svg className="w-6 h-6 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="font-body text-sm font-medium">
                <span className="font-bold">{toast.name}</span> aggiunto al carrello
            </p>
        </div>
    );
}
