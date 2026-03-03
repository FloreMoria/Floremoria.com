'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { buildGenericAlt } from '@/utils/altText';

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    const toggleMenu = () => setIsOpen(!isOpen);

    const navLinks = [
        { name: 'Home', href: '/' },
        { name: 'Chi siamo', href: '/chi-siamo' },
        { name: 'Fiori sulle tombe', href: '/fiori-sulle-tombe' },
        { name: 'Blog', href: '/blog' },
        { name: 'Per il funerale', href: '/per-il-funerale' },
        { name: 'Per animali domestici', href: '/per-animali-domestici' },
        { name: 'Per enti pubblici', href: '/enti-pubblici' },
        { name: 'Assistenza', href: '/assistenza' },
    ];

    return (
        <header className="bg-fm-section border-b border-fm-rose-soft/30 shadow-sm fixed w-full z-[999] top-0 left-0">
            <div className="w-full max-w-[1200px] mx-auto px-[20px] lg:px-[32px]">
                <div className="flex justify-between items-center h-[72px]">
                    <Link href="/" className="text-[26px] font-display font-semibold text-fm-text tracking-tight flex items-center gap-3">
                        <div className="relative flex items-center justify-center">
                            <Image src="/images/brand/Logo FloreMoria.png" alt={buildGenericAlt('logo')} width={400} height={379} className="h-[28px] lg:h-[32px] w-auto object-contain rounded-sm" priority />
                        </div>
                        <span>FloreMoria</span>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden lg:flex space-x-6">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`text-sm font-body font-medium transition-colors ${isActive
                                        ? 'text-fm-cta'
                                        : 'text-fm-muted hover:text-fm-cta'
                                        }`}
                                >
                                    {link.name}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="hidden lg:flex items-center space-x-4">
                        <Link
                            href="/login"
                            className="text-sm font-body font-medium text-fm-text border border-fm-rose-soft px-4 py-2 rounded-lg hover:bg-fm-section transition-colors"
                        >
                            Log In
                        </Link>
                        <Link href="/carrello" className="text-fm-text hover:text-fm-cta p-2 transition-colors flex items-center" aria-label="Carrello">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </Link>
                    </div>

                    {/* Mobile menu button & Cart */}
                    <div className="lg:hidden flex items-center space-x-1">
                        <Link href="/carrello" className="text-fm-text hover:text-fm-cta p-2 transition-colors flex items-center" aria-label="Carrello">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </Link>
                        <button onClick={toggleMenu} className="text-fm-text hover:text-fm-cta focus:outline-none p-2 rounded-md" aria-label="Menu">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {isOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                                )}
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Navigation */}
            {isOpen && (
                <div className="lg:hidden bg-fm-bg border-t border-fm-rose-soft/30 shadow-lg">
                    <div className="px-4 py-4 space-y-2">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`block px-3 py-2.5 rounded-md text-base font-body font-medium ${isActive
                                        ? 'text-fm-cta bg-fm-cta-soft/30'
                                        : 'text-fm-text hover:text-fm-cta hover:bg-fm-section'
                                        }`}
                                    onClick={() => setIsOpen(false)}
                                >
                                    {link.name}
                                </Link>
                            );
                        })}
                        <Link
                            href="/login"
                            className="block mt-4 text-center px-4 py-3 rounded-lg text-base font-body font-medium border border-fm-rose-soft text-fm-text hover:bg-fm-section"
                            onClick={() => setIsOpen(false)}
                        >
                            Log In
                        </Link>
                    </div>
                </div>
            )}
        </header>
    );
}
