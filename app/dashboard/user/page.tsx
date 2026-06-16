import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { LogOut, Heart } from 'lucide-react';
import { isDashboardAdminRole } from '@/lib/superAdmin';
import {
    groupOrdersByDeceased,
    UserBachecaOrderCard,
} from '@/components/dashboard/UserBachecaOrderCard';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Bacheca Personale | FloreMoria',
};

const BACHECA_COOKIE_ROLES: UserRole[] = [UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN];

export default async function UserDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ highlight?: string }>;
}) {
    const { highlight } = await searchParams;
    const cookieStore = await cookies();
    const cookieRole = cookieStore.get('fm_user_role')?.value;
    const userEmail = cookieStore.get('fm_user_email')?.value;

    if (!cookieRole || !userEmail || !BACHECA_COOKIE_ROLES.includes(cookieRole as UserRole)) {
        redirect('/login?expired=1');
    }

    const user = await prisma.user.findUnique({
        where: { email: userEmail },
    });

    if (!user) {
        redirect('/login?error=user_not_found');
    }

    const showFinancialDetails = isDashboardAdminRole(user.systemRole);
    const showGpsMap = showFinancialDetails;

    try {
        await prisma.order.updateMany({
            where: { buyerEmail: userEmail, userId: null },
            data: { userId: user.id },
        });
    } catch (e) {
        console.error('[dashboard-user] Errore associazione retroattiva ordini:', e);
    }

    const orders = await prisma.order.findMany({
        where: { userId: user.id },
        include: {
            items: { include: { product: true } },
            deliveryProof: true,
            deceasedProfile: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    const deceasedGroups = groupOrdersByDeceased(orders);
    const totalSpentCents = showFinancialDetails
        ? orders.reduce((sum, order) => sum + order.totalPriceCents, 0)
        : 0;

    return (
        <div className="min-h-screen bg-[#FAF9F6] text-[#1e293b]">
            <header className="bg-[#0f172a] text-white border-b-3 border-[#c5a880] py-6 px-4 sm:px-6 lg:px-8 sticky top-0 z-40 shadow-sm">
                <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <div>
                        <div className="text-xl font-display font-medium text-white tracking-widest uppercase">
                            FloreMoria
                        </div>
                        <p className="text-[10px] uppercase tracking-wider text-[#c5a880] font-semibold mt-0.5">
                            {showFinancialDetails ? 'Bacheca Amministratore' : 'Spazio Riservato Utente'}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="hidden sm:inline text-xs text-slate-300 font-mono">{user.email}</span>
                        <Link
                            href="/api/auth/logout"
                            className="inline-flex items-center gap-1 px-3.5 py-1.5 border border-slate-700 hover:border-[#c5a880] hover:text-[#c5a880] rounded-xl text-xs font-semibold transition-all text-slate-300"
                        >
                            <LogOut size={13} />
                            Esci
                        </Link>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
                <div className="bg-white/80 backdrop-blur-xl border border-white/60 p-6 sm:p-8 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            Gentile {user.name || 'Cliente'},
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            {showFinancialDetails
                                ? 'Panoramica completa degli omaggi, con dettaglio economico e tracciamento operativo.'
                                : 'In questa pagina può tracciare in tempo reale la posa e lo stato dei Suoi omaggi commemorativi.'}
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className="bg-[#c5a880]/10 border border-[#c5a880]/20 px-4 py-2.5 rounded-xl inline-flex items-center gap-2">
                            <Heart className="text-[#c5a880]" size={16} />
                            <span className="text-xs font-bold text-[#c5a880] uppercase tracking-wider">
                                {orders.length} {orders.length === 1 ? 'Omaggio' : 'Omaggi'}
                            </span>
                        </div>
                        {showFinancialDetails ? (
                            <p className="text-xs font-mono text-slate-600">
                                Totale storico:{' '}
                                <span className="font-bold text-slate-900">
                                    €{(totalSpentCents / 100).toFixed(2)}
                                </span>
                            </p>
                        ) : null}
                    </div>
                </div>

                <div className="space-y-10">
                    <h2 className="text-lg font-bold text-slate-800 tracking-tight">I Suoi Omaggi Floreali</h2>

                    {orders.length === 0 ? (
                        <div className="bg-white/80 border border-slate-200/60 p-12 rounded-[24px] text-center space-y-4">
                            <div className="text-slate-300 text-5xl">❀</div>
                            <h3 className="text-base font-bold text-slate-700">Nessun ordine trovato</h3>
                            <p className="text-sm text-slate-400 max-w-sm mx-auto">
                                Se ha acquistato di recente, il Suo ordine apparirà qui non appena il pagamento sarà
                                confermato.
                            </p>
                            <Link
                                href="/"
                                className="inline-block px-5 py-2.5 bg-[#c5a880] hover:bg-[#b59870] text-white text-xs font-bold rounded-xl uppercase tracking-wider"
                            >
                                Visita il Catalogo
                            </Link>
                        </div>
                    ) : (
                        deceasedGroups.map((group) => (
                            <section key={group.key} className="space-y-4">
                                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                            In memoria di
                                        </p>
                                        <h3 className="text-xl font-display font-semibold text-slate-900 flex items-center gap-2">
                                            <Heart size={16} className="text-red-500 fill-red-500" />
                                            {group.deceasedName}
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-1">{group.cemeteryLabel}</p>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        {group.orders.length}{' '}
                                        {group.orders.length === 1 ? 'omaggio' : 'omaggi'}
                                    </span>
                                </div>
                                <div className="space-y-5">
                                    {group.orders.map((order) => (
                                        <UserBachecaOrderCard
                                            key={order.id}
                                            order={order}
                                            highlight={highlight}
                                            showFinancialDetails={showFinancialDetails}
                                            showGpsMap={showGpsMap}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}
