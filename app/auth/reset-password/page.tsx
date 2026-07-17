import prisma from '@/lib/prisma';
import ClientResetForm from './ClientResetForm';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Ripristino Password | FloreMoria',
};

type PageProps = {
    searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const token = params.token?.trim();

    if (!token) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
                <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Errore</p>
                    <h1 className="mt-4 text-xl font-display font-semibold text-slate-900">Token Mancante</h1>
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">
                        Il link di recupero non contiene un codice valido. Richiedi un nuovo link.
                    </p>
                </div>
            </div>
        );
    }

    const user = await prisma.user.findFirst({
        where: { resetPasswordToken: token }
    });

    if (!user) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
                <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Errore</p>
                    <h1 className="mt-4 text-xl font-display font-semibold text-slate-900">Link Non Valido</h1>
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">
                        Il link per reimpostare la password non è valido o è già stato utilizzato.
                    </p>
                </div>
            </div>
        );
    }

    if (user.resetPasswordTokenExpires && new Date() > user.resetPasswordTokenExpires) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
                <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Errore</p>
                    <h1 className="mt-4 text-xl font-display font-semibold text-slate-900">Link Scaduto</h1>
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">
                        Questo link è scaduto (validità di 1 ora superata). Richiedi un nuovo link.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
            <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-center text-[#c5a880] mb-2">Reimposta Password</p>
                <h1 className="text-xl font-display font-bold text-center text-slate-900 mb-6 font-semibold">Scegli una nuova password</h1>
                <p className="text-sm text-slate-600 text-center mb-6">
                    Inserisci la nuova password per il tuo account (<strong>{user.email}</strong>).
                </p>
                <ClientResetForm token={token} />
            </div>
        </div>
    );
}
