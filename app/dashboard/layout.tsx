import { ReactNode, type CSSProperties } from 'react';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { Search } from 'lucide-react';
import TopNavLink from '@/components/dashboard/TopNavLink';
import TopNavDropdown from '@/components/dashboard/TopNavDropdown';
import DashboardMobileNav from '@/components/dashboard/DashboardMobileNav';
import StaffAlertPoller from '@/components/dashboard/StaffAlertPoller';
import DashboardSwipeBack from '@/components/dashboard/DashboardSwipeBack';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';
import TestModeBanner from '@/components/dashboard/TestModeBanner';
import { isDashboardAdminRole, isSuperAdminRole } from '@/lib/superAdmin';

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
    themeColor: '#C0A062',
};

export const metadata: Metadata = {
    title: 'FloreMoria Dashboard',
    description: 'Sistema gestionale avanzato FloreMoria.',
    manifest: '/manifest-staff.webmanifest',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'FloreMoria Staff',
    },
    icons: {
        apple: [{ url: '/apple-icon-v2.png', sizes: '180x180', type: 'image/png' }],
    },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const cookieStore = await cookies();
    const userRole = cookieStore.get('fm_user_role')?.value || '';

    // Configura i ruoli che triggerano System-Clean
    const isSystemClean = ['SUPER_ADMIN', 'OPERATOR', 'MARKETING_MANAGER'].includes(userRole);
    const isSuperAdmin = isSuperAdminRole(userRole);
    const isDashboardAdmin = isDashboardAdminRole(userRole);
    const testModeActive = await getDashboardTestModeActive();

    const chromeStyle = {
        // Altezza chrome superiore (banner test opzionale + navbar h-14) per overlay full-page sotto il menù.
        ['--dashboard-chrome-h' as string]: testModeActive ? '5.75rem' : '3.5rem',
    } as CSSProperties;

    return (
        <div
            className={`dashboard-shell flex flex-col min-h-screen h-[100dvh] w-full max-w-full overflow-x-hidden overflow-y-hidden font-sans antialiased transition-colors duration-300 ${isSystemClean ? 'theme-system-clean bg-[#FFFFFF] text-[#1A1A1A]' : 'bg-[#fbfbfd] text-[#1d1d1f]'}`}
            style={{
                ...chromeStyle,
                paddingTop: 'env(safe-area-inset-top, 0px)',
            }}
        >

            {testModeActive ? <TestModeBanner /> : null}
            {/* Top Navbar */}
            <header className="h-14 flex items-center justify-between px-4 md:px-6 bg-white border-b border-gray-200 sticky top-0 z-30 shrink-0 min-w-0 max-w-full print:hidden">

                <div className="flex items-center gap-4 md:gap-8 min-w-0">
                    {/* Brand */}
                    <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer opacity-90 hover:opacity-100 transition-opacity shrink-0">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-sm shadow-sm ${isSystemClean ? 'bg-gray-100 text-gray-600 border border-gray-200' : 'bg-black text-white shadow-md'}`}>
                            F
                        </div>
                        <span className={`font-semibold text-[15px] tracking-tight ${isSystemClean ? 'text-gray-800' : 'text-black'}`}>
                            {isSystemClean ? 'FM Lab' : 'FloreMoria'}
                        </span>
                    </Link>

                    {/* Primary Navigation (desktop) */}
                    <nav className="hidden md:flex items-center gap-1.5 w-full scroll-smooth">
                        <TopNavLink href="/dashboard" label="Overview" />
                        <TopNavLink href="/dashboard/orders" label="Ordini" />
                        <TopNavLink href="/dashboard/users" label="Utenti" />
                        <TopNavLink href="/dashboard/defunti" label="Defunti" />
                        <TopNavLink href="/dashboard/products" label="Prodotti" />
                        <TopNavLink href="/dashboard/fioristi" label="Fioristi" />
                        <TopNavLink href="/dashboard/communications" label="Messaggi" />
                        <TopNavDropdown 
                            label="Sistema" 
                            items={[
                                { href: '/dashboard/partner', label: 'Partner B2B' },
                                { href: '/dashboard/agenzie', label: 'Agenzie Funebri' },
                                { href: '/dashboard/logs', label: 'Log di Sistema' },
                                { href: '/dashboard/offers', label: 'Buoni' }
                            ]} 
                        />
                        {isSuperAdmin ? (
                            <TopNavLink href="/dashboard/settings/roles" label="Ruoli" />
                        ) : null}
                    </nav>
                </div>

                {/* Right Bar */}
                <div className="flex items-center gap-3 md:gap-5 shrink-0">
                    <DashboardMobileNav
                        isDashboardAdmin={isDashboardAdmin}
                        isSuperAdmin={isSuperAdmin}
                    />
                    <div className="relative hidden lg:block w-48">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Cerca record..."
                            className="w-full bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100 rounded-full py-1.5 pl-9 pr-4 text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white text-black placeholder:text-gray-400"
                        />
                    </div>

                    <div className="h-5 w-px bg-gray-200 hidden md:block"></div>

                    <Link href="/dashboard/profile" className="flex items-center gap-2.5 p-1 pr-3 rounded-full hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 border border-black/10 overflow-hidden">
                            {/* Avatar Placeholder */}
                        </div>
                        <span className="text-sm font-semibold text-gray-700 hidden sm:block">Admin</span>
                    </Link>
                </div>
            </header>

            {/* Dynamic Page Content */}
            <main
                className={`flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden relative w-full bg-white z-10 custom-scrollbar ${userRole === 'USER' ? 'p-0 dashboard-main-fullbleed' : 'p-4 md:p-6 lg:p-8 dashboard-main-padded'}`}
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
            >
                <div className="w-full min-w-0 max-w-full overflow-x-hidden">{children}</div>
            </main>

            <StaffAlertPoller />
            <DashboardSwipeBack />
        </div>
    );
}
