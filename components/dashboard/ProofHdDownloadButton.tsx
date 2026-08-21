'use client';

/**
 * Pulsante download HD isolato: la card bacheca resta Server Component.
 * Un onClick inline sul server rompeva /dashboard/user (Event Handler → 500).
 */

import { downloadMedia } from '@/lib/utils/downloadMedia';

export default function ProofHdDownloadButton(props: {
    orderId: string;
    photoUrl: string;
    orderNumber?: string | null;
}) {
    const filename = `foto-posa-${props.orderNumber || props.orderId}.jpg`;
    const url = `/api/delivery-proof/download?orderId=${encodeURIComponent(props.orderId)}&url=${encodeURIComponent(props.photoUrl)}`;

    return (
        <button
            type="button"
            onClick={() =>
                void downloadMedia({
                    url,
                    filename,
                    title: 'Foto Posa FloreMoria',
                })
            }
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold uppercase tracking-wider hover:border-[#c5a880] hover:text-[#8a7048] transition-colors"
        >
            Scarica HD
        </button>
    );
}
