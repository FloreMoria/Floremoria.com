import { Suspense } from 'react';
import MagicLinkConfirmClient from './MagicLinkConfirmClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Conferma accesso | FloreMoria',
};

export default function MagicLinkConfirmPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] text-sm text-slate-500">
                    Preparazione accesso…
                </div>
            }
        >
            <MagicLinkConfirmClient />
        </Suspense>
    );
}
