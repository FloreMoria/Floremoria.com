'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function TopNavLink({ href, label }: { href: string; label: string }) {
    const pathname = usePathname() || '';
    
    // Logica per calcolare se il link è attivo:
    // Se "Overview" (/dashboard), deve essere esatto.
    // Altrimenti, basta che l'URL inizi con l'href corrente (es. /dashboard/logs/1 è compreso in /dashboard/logs)
    const active = href === '/dashboard' 
        ? pathname === '/dashboard' 
        : pathname.startsWith(href);

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
    );
}
