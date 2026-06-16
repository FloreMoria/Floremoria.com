'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import FloristProofUploadClient from '@/components/fiorista/FloristProofUploadClient';

type Props = {
    orderId: string;
    orderNumber: string | null;
    deceasedName: string;
    cemeteryName: string;
    cemeteryCity: string;
};

/** Pannello admin collassabile per upload manuale foto consegna dalla bacheca. */
export default function AdminManualProofUploadPanel({
    orderId,
    orderNumber,
    deceasedName,
    cemeteryName,
    cemeteryCity,
}: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);

    const handleComplete = () => {
        setOpen(false);
        router.refresh();
    };

    return (
        <div className="mt-4 border-t border-slate-100 pt-4">
            {!open ? (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#c5a880]/40 bg-[#c5a880]/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#8a7349] transition hover:border-[#c5a880] hover:bg-[#c5a880]/15"
                >
                    <Upload size={14} />
                    Carica foto manualmente
                </button>
            ) : (
                <div className="rounded-2xl border border-[#c5a880]/30 bg-[#FAF9F6] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-slate-600">
                            Upload amministratore — ordine #{orderNumber || orderId.slice(0, 8)}
                        </p>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                        >
                            Chiudi
                        </button>
                    </div>
                    <FloristProofUploadClient
                        embedded
                        adminUpload
                        orderId={orderId}
                        orderNumber={orderNumber}
                        deceasedName={deceasedName}
                        cemeteryName={cemeteryName}
                        cemeteryCity={cemeteryCity}
                        onUploadComplete={handleComplete}
                    />
                </div>
            )}
        </div>
    );
}
