'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, ShoppingBag, User } from 'lucide-react';
import { useState } from 'react';
import { buildGenericAlt } from '@/utils/altText';
import { useCartCount } from '@/lib/cart/useCartCount';

function isNavLinkActive(pathname: string, href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
}

const QUICK_LINKS = [
    { name: 'Home', href: '/' },
    { name: 'Fiori sulle tombe', href: '/fiori-sulle-tombe' },
    { name: 'Fiori per il funerale', href: '/per-il-funerale' },
    { name: 'Piccoli Amici', href: '/per-animali-domestici' },
    { name: 'Assistenza', href: '/assistenza' },
    { name: 'Blog', href: '/blog' },
];

/**
 * Header compatto mobile — logo centrato, carrello con badge, menu rapido.
 * Visibile solo sotto md (app shell pubblica).
 */
export default function MobileAppHeader() {
    const pathname = usePathname() || '/';
    const cartCount = useCartCount();
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <>
            <header
                className="md:hidden fixed left-0 right-0 z-[998] border-b border-fm-rose-soft/30 bg-fm-section/95 backdrop-blur-md supports-[backdrop-filter]:bg-fm-section/90"
                style={{
                    top: 'var(--fm-maint-banner-h, 0px)',
                    paddingTop: 'env(safe-area-inset-top, 0px)',
                }}
            >
                <div className="mx-auto grid h-14 max-w-[1200px] grid-cols-3 items-center px-3">
                    <button
                        type="button"
                        onClick={() => setMenuOpen(true)}
                        className="fm-touch-target inline-flex items-center justify-center justify-self-start rounded-xl text-fm-text hover:bg-fm-gold-soft/60"
                        aria-label="Apri menu"
                    >
                        <Menu className="h-6 w-6" aria-hidden />
                    </button>

                    <Link href="/" className="flex items-center justify-center justify-self-center">
                        <Image
                            src="/images/brand/Logo FloreMoria.png"
                            alt={buildGenericAlt('logo')}
                            width={120}
                            height={40}
                            className="h-7 w-auto object-contain"
                            priority
                        />
                    </Link>

                    <div className="flex items-center justify-end justify-self-end gap-0.5">
                        <Link
                            href="/login"
                            className="fm-touch-target inline-flex items-center justify-center rounded-xl text-fm-text hover:bg-fm-gold-soft/60"
                            aria-label="Profilo"
                        >
                            <User className="h-5 w-5" aria-hidden />
                        </Link>
                        <Link
                            href="/carrello"
                            className="fm-touch-target relative inline-flex items-center justify-center rounded-xl text-fm-text hover:bg-fm-gold-soft/60"
                            aria-label={`Carrello${cartCount > 0 ? `, ${cartCount} articoli` : ''}`}
                        >
                            <ShoppingBag className="h-5 w-5" aria-hidden />
                            {cartCount > 0 ? (
                                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-fm-cta px-1 text-[10px] font-bold leading-none text-white">
                                    {cartCount > 9 ? '9+' : cartCount}
                                </span>
                            ) : null}
                        </Link>
                    </div>
                </div>
            </header>

            {menuOpen ? (
                <div className="md:hidden fixed inset-0 z-[999]">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/30"
                        aria-label="Chiudi menu"
                        onClick={() => setMenuOpen(false)}
                    />
                    <div
                        className="absolute bottom-0 left-0 right-0 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-fm-rose-soft/40 bg-fm-bg shadow-2xl"
                        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                    >
                        <div className="px-4 py-4">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-fm-muted">
                                Menu
                            </p>
                            <nav className="space-y-1">
                                {QUICK_LINKS.map((link) => {
                                    const active = isNavLinkActive(pathname, link.href);
                                    return (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            onClick={() => setMenuOpen(false)}
                                            className={`fm-touch-target flex min-h-11 items-center rounded-xl px-3 text-[15px] font-medium ${
                                                active
                                                    ? 'bg-fm-cta-soft text-fm-cta'
                                                    : 'text-fm-text hover:bg-fm-section'
                                            }`}
                                        >
                                            {link.name}
                                        </Link>
                                    );
                                })}
                                <Link
                                    href="/login"
                                    onClick={() => setMenuOpen(false)}
                                    className="fm-touch-target mt-2 flex min-h-11 items-center justify-center rounded-xl border border-fm-rose-soft text-[15px] font-semibold text-fm-text"
                                >
                                    Accedi
                                </Link>
                            </nav>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
