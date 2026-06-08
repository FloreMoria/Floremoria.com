import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { User, TrendingUp, Package, ShieldCheck } from 'lucide-react';
import prisma from '@/lib/prisma';
import {
    canManageOwnProfile,
    isBypassElevatedEmail,
    resolveSessionUser,
} from '@/lib/auth/sessionUser';
import { ADMIN_ROLE_NAME, SUPER_ADMIN_ROLE_NAME } from '@/lib/superAdmin';
import ProfileForm, { ProfileData } from './ProfileForm';

async function getRevenueData(role: string, userId: string | null) {
    if (role === SUPER_ADMIN_ROLE_NAME || role === ADMIN_ROLE_NAME) {
        const aggr = await prisma.order.aggregate({
            _sum: { totalPriceCents: true },
            where: { status: 'COMPLETED' },
        });
        const count = await prisma.order.count({ where: { status: 'COMPLETED' } });
        return { total: (aggr._sum.totalPriceCents || 0) / 100, count };
    }

    if ((role === 'FLORIST' || role === 'AGENCY') && userId) {
        const aggr = await prisma.order.aggregate({
            _sum: { totalPriceCents: true },
            where: { status: 'COMPLETED', userId },
        });
        const count = await prisma.order.count({ where: { status: 'COMPLETED', userId } });
        return { total: (aggr._sum.totalPriceCents || 0) / 100, count };
    }

    return { total: 0, count: 0 };
}

export default async function ProfilePage() {
    const cookieStore = await cookies();
    const userRole = cookieStore.get('fm_user_role')?.value || 'USER';

    const { user } = await resolveSessionUser();

    if (!user || !canManageOwnProfile(userRole, user)) {
        redirect('/login');
    }

    const profileData: ProfileData = {
        id: user.id,
        name: user.name ?? '',
        email: user.email,
        phone: user.phone ?? '',
        company: user.company ?? '',
        vatNumber: user.vatNumber ?? '',
        systemRole: user.systemRole,
        emailReadOnly: isBypassElevatedEmail(user.email),
    };

    const { total: revenue, count: completedOrders } = await getRevenueData(userRole, user.id);
    const isLabUser = [SUPER_ADMIN_ROLE_NAME, ADMIN_ROLE_NAME, 'OPERATOR', 'STAKEHOLDER'].includes(userRole);

    return (
        <div className="max-w-6xl mx-auto space-y-10 pb-16">
            <div className="flex items-end justify-between pb-6 border-b border-gray-100">
                <div>
                    <h1 className="text-3xl font-display font-semibold text-gray-900 flex items-center gap-3">
                        <User className="text-fm-gold" size={32} />
                        Il Tuo Profilo
                    </h1>
                    <p className="text-fm-muted font-body mt-2">
                        Gestisci le tue informazioni personali. I dati anagrafici non influenzano le credenziali di bypass.
                    </p>
                </div>
                <div className="hidden md:flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-200">
                    <ShieldCheck size={18} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-gray-800 tracking-wide">
                        Livello: <span className="text-emerald-700">{userRole}</span>
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white/80 backdrop-blur-xl rounded-[24px] border border-gray-100 shadow-sm p-8">
                        <h2 className="text-xl font-display font-semibold text-gray-900 mb-6">Informazioni di Base</h2>
                        <ProfileForm initialProfile={profileData} />
                    </div>
                </div>

                <div className="space-y-6">
                    {(userRole === SUPER_ADMIN_ROLE_NAME ||
                        userRole === ADMIN_ROLE_NAME ||
                        userRole === 'FLORIST' ||
                        userRole === 'AGENCY') && (
                        <div className="bg-white/80 backdrop-blur-xl rounded-[24px] border border-gray-100 shadow-sm p-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                                <TrendingUp size={120} />
                            </div>

                            <h2 className="text-xl font-display font-semibold text-gray-900 mb-6 flex items-center gap-2 relative z-10">
                                <TrendingUp className="text-fm-gold" size={20} />
                                Performance
                                {isLabUser && (
                                    <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-md">GLOBALE</span>
                                )}
                                {!isLabUser && (
                                    <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-md">TUA RETE</span>
                                )}
                            </h2>

                            <div className="space-y-6 relative z-10">
                                <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                                        Fatturato Maturato
                                    </div>
                                    <div className="text-3xl font-display font-medium text-gray-900">
                                        {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(revenue)}
                                    </div>
                                </div>

                                <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                                            Ordini Completati
                                        </div>
                                        <div className="text-2xl font-display font-medium text-gray-900">{completedOrders}</div>
                                    </div>
                                    <div className="bg-white p-3 rounded-full shadow-sm">
                                        <Package size={20} className="text-fm-gold" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
