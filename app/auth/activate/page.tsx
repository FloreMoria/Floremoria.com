import prisma from '@/lib/prisma';
import ClientActivateForm from './ClientActivateForm';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Attivazione Account Fiorista | FloreMoria',
};

type PageProps = {
    searchParams: Promise<{ token?: string }>;
};

export default async function ActivatePage({ searchParams }: PageProps) {
    const params = await searchParams;
    const token = params.token?.trim();

    if (!token) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
                <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Errore</p>
                    <h1 className="mt-4 text-xl font-display font-semibold text-slate-900">Token Mancante</h1>
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">
                        Il link di attivazione non contiene un codice valido. Contatta l'assistenza FloreMoria se pensi si tratti di un errore.
                    </p>
                </div>
            </div>
        );
    }

    const user = await prisma.user.findUnique({
        where: { activationToken: token }
    });

    if (!user) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
                <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Errore</p>
                    <h1 className="mt-4 text-xl font-display font-semibold text-slate-900">Link Non Valido</h1>
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">
                        Il link di attivazione non è valido o è già stato utilizzato.
                    </p>
                </div>
            </div>
        );
    }

    if (user.activationTokenExpires && new Date() > user.activationTokenExpires) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
                <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Errore</p>
                    <h1 className="mt-4 text-xl font-display font-semibold text-slate-900">Link Scaduto</h1>
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">
                        Il tuo link di attivazione è scaduto. Contatta l'amministratore per farti inviare un nuovo invito.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
            <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-center text-[#c5a880] mb-2">Attivazione Account</p>
                <h1 className="text-xl font-display font-bold text-center text-slate-900 mb-6 font-semibold">Benvenuto su FloreMoria</h1>
                <p className="text-sm text-slate-600 text-center mb-6">
                    Imposta una password sicura per attivare il tuo profilo di fiorista partner (<strong>{user.email}</strong>).
                </p>
                <ClientActivateForm token={token} />
            </div>
        </div>
    );
}
