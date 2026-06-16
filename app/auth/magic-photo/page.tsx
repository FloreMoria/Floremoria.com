import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifyMagicPhotoDeliveryToken } from '@/lib/auth/magicPhotoDelivery';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Accesso foto consegna | FloreMoria',
};

type PageProps = {
    searchParams: Promise<{ token?: string; expired?: string; invalid?: string }>;
};

function CourtesyShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
            <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a880]">Floremoria</p>
                {children}
            </div>
        </div>
    );
}

export default async function MagicPhotoPage({ searchParams }: PageProps) {
    const params = await searchParams;

    if (params.expired === '1' || params.invalid === '1') {
        const isExpired = params.expired === '1';
        return (
            <CourtesyShell>
                <h1 className="mt-4 text-xl font-display font-semibold text-slate-900">
                    {isExpired ? 'Link scaduto' : 'Link non valido'}
                </h1>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                    {isExpired
                        ? 'Gentile utente, il Magic Link è scaduto per sicurezza. Puoi accedere comunque al tuo account e visionare il tuo storico ordini e le foto premendo il tasto qui sotto.'
                        : 'Il link di accesso non è valido o è già stato utilizzato. Accedi al tuo account per consultare i tuoi ordini.'}
                </p>
                <Link
                    href="/login"
                    className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-[#0f172a] py-3.5 text-sm font-bold text-white transition hover:bg-slate-800"
                >
                    Accedi al tuo account
                </Link>
            </CourtesyShell>
        );
    }

    const token = params.token?.trim();
    if (!token) {
        redirect('/auth/magic-photo?invalid=1');
    }

    const verified = verifyMagicPhotoDeliveryToken(token);
    if (!verified) {
        redirect('/auth/magic-photo?invalid=1');
    }
    if ('expired' in verified) {
        redirect('/auth/magic-photo?expired=1');
    }

    redirect(`/api/auth/magic-photo?token=${encodeURIComponent(token)}`);
}
