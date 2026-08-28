'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flower2, Home, MessageCircle, Search, ShoppingBag } from 'lucide-react';
import { useCartCount } from '@/lib/cart/useCartCount';

type NavItem = {
    href: string;
    label: string;
    icon: typeof Home;
    match: (pathname: string) => boolean;
    badge?: number;
};

function matchPrefix(pathname: string, base: string): boolean {
    if (base === '/') return pathname === '/';
    return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Barra di navigazione inferiore fissa — solo mobile (PWA app shell).
 */
export default function MobileBottomNav() {
    const pathname = usePathname() || '/';
    const cartCount = useCartCount();

    const items: NavItem[] = [
        {
            href: '/',
            label: 'Home',
            icon: Home,
            match: (p) => p === '/',
        },
        {
            href: '/fiori-sulle-tombe',
            label: 'Catalogo',
            icon: Flower2,
            match: (p) =>
                matchPrefix(p, '/fiori-sulle-tombe') ||
                matchPrefix(p, '/per-il-funerale') ||
                matchPrefix(p, '/per-animali-domestici'),
        },
        {
            href: '/profile/orders',
            label: 'Ordini',
            icon: Search,
            match: (p) => matchPrefix(p, '/profile'),
        },
        {
            href: '/carrello',
            label: 'Carrello',
            icon: ShoppingBag,
            match: (p) => matchPrefix(p, '/carrello') || matchPrefix(p, '/checkout'),
            badge: cartCount,
        },
        {
            href: '/assistenza',
            label: 'Assistenza',
            icon: MessageCircle,
            match: (p) => matchPrefix(p, '/assistenza'),
        },
    ];

    return (
        <nav
            className="md:hidden fixed bottom-0 left-0 right-0 z-[997] border-t border-fm-rose-soft/40 bg-fm-bg/95 backdrop-blur-md supports-[backdrop-filter]:bg-fm-bg/90"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            aria-label="Navigazione principale"
        >
            <ul className="mx-auto grid max-w-lg grid-cols-5">
                {items.map((item) => {
                    const active = item.match(pathname);
                    const Icon = item.icon;
                    return (
                        <li key={item.href}>
                            <Link
                                href={item.href}
                                className={`fm-touch-target relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold transition-colors ${
                                    active ? 'text-fm-cta' : 'text-fm-muted'
                                }`}
                            >
                                <span className="relative">
                                    <Icon
                                        className={`h-5 w-5 ${active ? 'stroke-[2.5px]' : 'stroke-2'}`}
                                        aria-hidden
                                    />
                                    {item.badge && item.badge > 0 ? (
                                        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-fm-cta px-0.5 text-[9px] font-bold text-white">
                                            {item.badge > 9 ? '9+' : item.badge}
                                        </span>
                                    ) : null}
                                </span>
                                <span>{item.label}</span>
                                {active ? (
                                    <span
                                        className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-fm-cta"
                                        aria-hidden
                                    />
                                ) : null}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
