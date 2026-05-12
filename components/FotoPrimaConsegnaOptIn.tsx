'use client';

import { useEffect, useId, useState } from 'react';
import {
    clearPreDeliveryPhotoPref,
    removePreDeliveryPhotoLineFromStoredCart,
    setPreDeliveryPhotoPref,
} from '@/lib/floremPreDeliveryPhoto';

/** Stessa chiave di `lib/floremPreDeliveryPhoto` (compat import). */
export { FLOREM_PRE_DELIVERY_PHOTO_PREF_KEY } from '@/lib/floremPreDeliveryPhoto';

export default function FotoPrimaConsegnaOptIn() {
    const id = useId();
    const [checked, setChecked] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    // Home: optional sempre OFF all'ingresso; niente ripristino da preferenze o sessioni precedenti.
    useEffect(() => {
        clearPreDeliveryPhotoPref();
        removePreDeliveryPhotoLineFromStoredCart();
        setChecked(false);
        setHydrated(true);
    }, []);

    const onChange = (next: boolean) => {
        setChecked(next);
        setPreDeliveryPhotoPref(next);
        if (!next) {
            removePreDeliveryPhotoLineFromStoredCart();
        }
    };

    return (
        <div className="rounded-2xl border border-stone-200/90 bg-[#FDFCF9]/95 px-4 py-4 sm:px-5 sm:py-4">
            <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
                <input
                    id={id}
                    type="checkbox"
                    checked={hydrated ? checked : false}
                    onChange={(e) => onChange(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300 text-fm-gold focus:ring-fm-gold/40 focus:ring-offset-0"
                />
                <span className="font-body text-[15px] leading-snug text-fm-text">
                    <span className="font-semibold">Foto dello stato di fatto prima della consegna</span>
                    <span className="text-fm-muted"> — supplemento opzionale </span>
                    <span className="whitespace-nowrap font-semibold text-fm-text">1,49 €</span>
                    <span className="text-fm-muted">
                        . Oltre alla foto gratuita dopo la posa, ricevi anche lo scatto del luogo prima dell&apos;intervento del
                        fiorista.
                    </span>
                </span>
            </label>
        </div>
    );
}
