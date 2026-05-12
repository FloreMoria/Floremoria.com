'use client';

type MobileUploadClientProps = {
    orderId: string;
    isFuneral: boolean;
};

/** Scheletro upload partner: UI completa da collegare a storage / API. */
export default function MobileUploadClient({ orderId, isFuneral }: MobileUploadClientProps) {
    return (
        <div className="mx-auto max-w-lg px-4 py-12 text-center">
            <h1 className="text-xl font-semibold text-[#111B21]">Upload ordine</h1>
            <p className="mt-2 text-sm text-gray-600">
                Ordine <span className="font-mono">{orderId}</span>
                {isFuneral ? ' · Funerale' : ''}
            </p>
            <p className="mt-6 text-sm text-gray-500">Interfaccia di caricamento in allestimento.</p>
        </div>
    );
}
