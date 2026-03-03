import React from 'react';
import { cookies } from 'next/headers';
import { PrismaClient } from '@prisma/client';
import { User, Mail, Building, Phone, TrendingUp, Package, ShieldCheck, Activity } from 'lucide-react';
import Protect from '@/components/shared/Protect';

const prisma = new PrismaClient();

async function getRevenueData(role: string, userId: string | null) {
    if (role === 'SUPER_ADMIN') {
        const aggr = await prisma.order.aggregate({
            _sum: { totalPriceCents: true },
            where: { status: 'COMPLETED' }
        });
        const count = await prisma.order.count({ where: { status: 'COMPLETED' } });
        return { total: (aggr._sum.totalPriceCents || 0) / 100, count };
    }

    if (role === 'PARTNER_FLORIST' && userId) {
        const aggr = await prisma.order.aggregate({
            _sum: { totalPriceCents: true },
            where: { status: 'COMPLETED', userId: userId }
        });
        const count = await prisma.order.count({ where: { status: 'COMPLETED', userId: userId } });
        return { total: (aggr._sum.totalPriceCents || 0) / 100, count };
    }

    return { total: 0, count: 0 };
}

export default async function ProfilePage() {
    const cookieStore = await cookies();
    const userRole = cookieStore.get('fm_user_role')?.value || 'USER';

    // Mock ID per test, in futuro usare l'ID da NextAuth fallback a null
    const mockUserId = 'mock-florist-id';

    const { total: revenue, count: completedOrders } = await getRevenueData(userRole, mockUserId);

    // Testo di formato basato sul ruolo
    const isLabUser = ['SUPER_ADMIN', 'OPERATOR', 'MARKETING_MANAGER'].includes(userRole);

    return (
        <div className="max-w-6xl mx-auto space-y-10 pb-16">

            <div className="flex items-end justify-between pb-6 border-b border-gray-100">
                <div>
                    <h1 className="text-3xl font-display font-semibold text-gray-900 flex items-center gap-3">
                        <User className="text-fm-gold" size={32} />
                        Il Tuo Profilo
                    </h1>
                    <p className="text-fm-muted font-body mt-2">
                        Gestisci le tue informazioni personali, la sicurezza e visualizza i tuoi risultati.
                    </p>
                </div>
                <div className="hidden md:flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-200">
                    <ShieldCheck size={18} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-gray-800 tracking-wide">Livello: <span className="text-emerald-700">{userRole}</span></span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* SINISTRA: Modulo Dati Personali */}
                <div className="lg:col-span-2 space-y-8">
                    <Protect permission="personal_profile" fallback={
                        <div className="p-8 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex gap-3 text-sm">
                            <Activity /> Non sei autorizzato a visualizzare o modificare profili.
                        </div>
                    }>
                        <div className="bg-white/80 backdrop-blur-xl rounded-[24px] border border-gray-100 shadow-sm p-8">
                            <h2 className="text-xl font-display font-semibold text-gray-900 mb-6">Informazioni di Base</h2>
                            <form className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Nome Ufficiale</label>
                                        <div className="relative">
                                            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input type="text" defaultValue="Admin User" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none" />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Email di Accesso</label>
                                        <div className="relative">
                                            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input type="email" defaultValue="salvatore@floremoria.eu" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none" />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Azienda / P.IVA</label>
                                        <div className="relative">
                                            <Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input type="text" defaultValue="FloreMoria Srl" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none" />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Telefono</label>
                                        <div className="relative">
                                            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input type="text" defaultValue="+39 000 000 000" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none" />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-gray-50 flex justify-end">
                                    <button type="button" className="bg-gray-900 hover:bg-black text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md">
                                        Aggiorna Dati
                                    </button>
                                </div>
                            </form>
                        </div>
                    </Protect>
                </div>

                {/* DESTRA: Analytics & Finance Widget */}
                <div className="space-y-6">
                    {(userRole === 'SUPER_ADMIN' || userRole === 'PARTNER_FLORIST') && (
                        <Protect permission="partner_finance">
                            <div className="bg-white/80 backdrop-blur-xl rounded-[24px] border border-gray-100 shadow-sm p-8 relative overflow-hidden">
                                {/* Decorazione Sfondo */}
                                <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                                    <TrendingUp size={120} />
                                </div>

                                <h2 className="text-xl font-display font-semibold text-gray-900 mb-6 flex items-center gap-2 relative z-10">
                                    <TrendingUp className="text-fm-gold" size={20} />
                                    Performance
                                    {isLabUser && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-md">GLOBALE</span>}
                                    {!isLabUser && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-md">TUA RETE</span>}
                                </h2>

                                <div className="space-y-6 relative z-10">
                                    <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Fatturato Maturato</div>
                                        <div className="text-3xl font-display font-medium text-gray-900">
                                            {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(revenue)}
                                        </div>
                                    </div>

                                    <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                        <div>
                                            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Ordini Completati</div>
                                            <div className="text-2xl font-display font-medium text-gray-900">{completedOrders}</div>
                                        </div>
                                        <div className="bg-white p-3 rounded-full shadow-sm">
                                            <Package size={20} className="text-fm-gold" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Protect>
                    )}
                </div>
            </div>

        </div>
    );
}
