'use client';

import React from 'react';

export type FloremCartCategoryModalProps = {
    open: boolean;
    onCancel: () => void;
    /** Svuota il carrello ed esegue l’azione di aggiunta già decisa dal chiamante. */
    onClearAndAdd: () => void;
};

/**
 * NINA / ARLO — Quiet Luxury: blocco mix categorie (FT / FF / FA) nel carrello.
 * Regola rigida: Piccoli Amici (FA) non si combinano con Tombe (FT) nello stesso ordine.
 */
export default function FloremCartCategoryModal({ open, onCancel, onClearAndAdd }: FloremCartCategoryModalProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px] transition-opacity"
                onClick={onCancel}
                aria-label="Chiudi"
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="florem-cart-category-modal-title"
                className="relative w-full max-w-md rounded-2xl border border-stone-200/95 bg-[#FAFAF8] px-7 py-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.18)]"
            >
                <h2 id="florem-cart-category-modal-title" className="font-display text-xl font-semibold tracking-tight text-stone-900">
                    Un ordine, una sezione
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-stone-600">
                    Il carrello contiene già articoli di{' '}
                    <strong className="font-semibold text-stone-800">un&apos;altra sezione</strong> del catalogo (Fiori sulle Tombe,
                    Funerale o Piccoli Amici). Non è possibile unire sezioni diverse in un singolo ordine.
                </p>
                <p className="mt-2 text-sm text-stone-500">Puoi svuotare il carrello e aggiungere questo articolo, oppure annullare.</p>
                <div className="mt-8 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end sm:gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 transition-colors hover:border-stone-400 hover:bg-stone-50"
                    >
                        Annulla
                    </button>
                    <button
                        type="button"
                        onClick={onClearAndAdd}
                        className="rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-stone-800"
                    >
                        Svuota carrello e aggiungi
                    </button>
                </div>
            </div>
        </div>
    );
}
