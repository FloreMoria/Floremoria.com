import { ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { Search } from 'lucide-react';

export const metadata = {
    title: 'FloreMoria Dashboard',
    description: 'Sistema gestionale avanzato FloreMoria.',
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const cookieStore = await cookies();
    const userRole = cookieStore.get('fm_user_role')?.value || '';

    // Configura i ruoli che triggerano System-Clean
    const isSystemClean = ['SUPER_ADMIN', 'OPERATOR', 'MARKETING_MANAGER'].includes(userRole);

    return (
        <div className={`flex flex-col h-screen w-full font-sans antialiased overflow-hidden transition-colors duration-300 ${isSystemClean ? 'theme-system-clean bg-[#FFFFFF] text-[#1A1A1A]' : 'bg-[#fbfbfd] text-[#1d1d1f]'}`}>

            {/* Top Navbar */}
            <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-gray-200 sticky top-0 z-30 shrink-0 print:hidden">

                <div className="flex items-center gap-8">
                    {/* Brand */}
                    <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer opacity-90 hover:opacity-100 transition-opacity">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-sm shadow-sm ${isSystemClean ? 'bg-gray-100 text-gray-600 border border-gray-200' : 'bg-black text-white shadow-md'}`}>
                            F
                        </div>
                        <span className={`font-semibold text-[15px] tracking-tight ${isSystemClean ? 'text-gray-800' : 'text-black'}`}>
                            {isSystemClean ? 'FM Lab' : 'FloreMoria'}
                        </span>
                    </Link>

                    {/* Primary Navigation */}
                    <nav className="hidden md:flex items-center gap-1.5">
                        <TopNavLink href="/dashboard" label="Overview" />
                        <TopNavLink href="/dashboard/orders" label="Ordini" />
                        <TopNavLink href="/dashboard/products" label="Prodotti" />
                        <TopNavLink href="/dashboard/fioristi" label="Fioristi" />
                        <TopNavLink href="/dashboard/fornitori" label="Fornitori" />
                        <TopNavLink href="/logs" label="Log di Sistema" />
                        <TopNavLink href="/dashboard/settings/roles" label="Impostazioni" />
                    </nav>
                </div>

                {/* Right Bar */}
                <div className="flex items-center gap-5">
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
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 relative w-full bg-white z-10 custom-scrollbar">
                {children}
            </main>

        </div>
    );
}

// Sub-Component for Horizontal Navigation Links
function TopNavLink({ href, label }: { href: string, label: string }) {
    // In un'implementazione reale, usa usePathname per determinare isActive dinamicamente.
    // Per ora, simuliamo usando un controllo rudimentale (o puoi passarlo come prop se vuoi).
    const active = false; // Mock

    return (
        <Link
            href={href}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${active
                ? 'bg-black text-white shadow-sm'
                : 'text-gray-600 hover:text-black hover:bg-gray-100'
                }`}
        >
            {label}
        </Link>
    )
}
