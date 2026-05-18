import { ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isSuperAdminRole } from '@/lib/superAdmin';
import { Shield } from 'lucide-react';

export const metadata = {
    title: 'Admin Panel · FloreMoria',
    robots: { index: false, follow: false },
};

export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
    const cookieStore = await cookies();
    const userRole = cookieStore.get('fm_user_role')?.value;

    if (!isSuperAdminRole(userRole)) {
        redirect('/login');
    }

    return (
        <div className="min-h-screen bg-[#0f1410] text-white flex flex-col">
            <header className="border-b border-white/10 bg-[#141a16]/90 backdrop-blur-md sticky top-0 z-20">
                <div className="w-full md:w-[95%] lg:w-[95%] max-w-[1800px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
                    <Link href="/admin-panel" className="flex items-center gap-2 font-display font-semibold tracking-tight">
                        <Shield className="w-5 h-5 text-fm-gold" aria-hidden />
                        FloreMoria Admin
                    </Link>
                    <nav className="flex items-center gap-1 text-sm">
                        <Link
                            href="/admin-panel"
                            className="px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/90"
                        >
                            Hub
                        </Link>
                        <Link
                            href="/admin-panel/roles"
                            className="px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/90"
                        >
                            Ruoli & Admin
                        </Link>
                        <Link
                            href="/dashboard/orders"
                            className="px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/70"
                        >
                            Dashboard ordini
                        </Link>
                    </nav>
                </div>
            </header>
            <main className="flex-1 w-full md:w-[95%] lg:w-[95%] max-w-[1800px] mx-auto px-4 sm:px-6 py-8">{children}</main>
        </div>
    );
}
