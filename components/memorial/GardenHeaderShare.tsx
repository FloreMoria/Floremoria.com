'use client';

import GardenSharePanel from '@/components/memorial/GardenSharePanel';

type Props = {
    gardenUrl: string;
    deceasedName: string;
    senderName?: string;
};

/** Blocco condivisione in testa al Giardino della Memoria pubblico. */
export default function GardenHeaderShare({ gardenUrl, deceasedName, senderName }: Props) {
    return (
        <div className="mt-8 max-w-md mx-auto">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-fm-muted mb-3">
                Condividi questo Giardino
            </p>
            <GardenSharePanel
                gardenUrl={gardenUrl}
                deceasedName={deceasedName}
                senderName={senderName}
                variant="garden"
            />
        </div>
    );
}
