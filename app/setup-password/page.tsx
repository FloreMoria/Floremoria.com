import { Suspense } from 'react';
import SetupPasswordForm from './SetupPasswordForm';

export const metadata = {
    title: 'Attivazione Account | FloreMoria',
};

// Next.js App Router Page: i searchParams sono asincroni (Promise) in Next.js 15/16.
// Li risolviamo lato server e passiamo il token al client per evitare warning di de-ottimizzazione.
export default async function SetupPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const resolvedParams = await searchParams;
    const token = typeof resolvedParams.token === 'string' ? resolvedParams.token.trim() : '';

    return (
        <div className="min-h-screen bg-[#FAF9F6] flex flex-col justify-center items-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
            {/* Effetti di luce di sfondo - Stile FloreMoria */}
            <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-gradient-to-bl from-[#c5a880]/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-gradient-to-tr from-emerald-600/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>

            <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <div className="text-center mb-6">
                    <div className="text-3xl font-display font-medium text-[#c5a880] tracking-widest uppercase">
                        FloreMoria
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                        Attivazione Collaboratore
                    </p>
                </div>

                <Suspense fallback={
                    <div className="bg-white/80 backdrop-blur-xl py-10 px-8 rounded-[32px] border border-white/60 text-center text-slate-500">
                        Caricamento in corso...
                    </div>
                }>
                    <SetupPasswordForm token={token} />
                </Suspense>
            </div>
        </div>
    );
}
