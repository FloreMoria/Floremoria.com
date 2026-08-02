'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, X } from 'lucide-react';

type NavItem = { href: string; label: string };

const PRIMARY_LINKS: NavItem[] = [
    { href: '/dashboard', label: 'Overview' },
    { href: '/dashboard/orders', label: 'Ordini' },
    { href: '/dashboard/users', label: 'Utenti' },
    { href: '/dashboard/defunti', label: 'Defunti' },
    { href: '/dashboard/products', label: 'Prodotti' },
    { href: '/dashboard/fioristi', label: 'Fioristi' },
    { href: '/dashboard/communications', label: 'Messaggi' },
];

const SISTEMA_LINKS: NavItem[] = [
    { href: '/dashboard/partner', label: 'Partner B2B' },
    { href: '/dashboard/logs', label: 'Log di Sistema' },
    { href: '/dashboard/offers', label: 'Buoni' },
];

function MobileNavLink({ href, label, onNavigate }: NavItem & { onNavigate: () => void }) {
    const pathname = usePathname() || '';
    const active =
        href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(href);

    return (
        <Link
            href={href}
            onClick={onNavigate}
            className={`block rounded-xl px-4 py-3.5 text-[15px] font-semibold transition-colors ${
                active
                    ? 'bg-black text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-black'
            }`}
        >
            {label}
        </Link>
    );
}

function MobileNavAccordion({
    label,
    items,
    onNavigate,
}: {
    label: string;
    items: NavItem[];
    onNavigate: () => void;
}) {
    const pathname = usePathname() || '';
    const isChildActive = items.some((item) => pathname.startsWith(item.href));
    const [isOpen, setIsOpen] = useState(isChildActive);

    useEffect(() => {
        if (isChildActive) {
            setIsOpen(true);
        }
    }, [isChildActive]);

    return (
        <div className="space-y-1">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className={`flex items-center justify-between w-full rounded-xl px-4 py-3.5 text-[15px] font-semibold transition-colors ${
                    isChildActive
                        ? 'bg-gray-100 text-black font-bold'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-black'
                }`}
            >
                <span>{label}</span>
                <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-black' : 'text-gray-500'
                    }`}
                />
            </button>

            {isOpen ? (
                <div className="pl-4 space-y-1 transition-all duration-200">
                    {items.map((item) => {
                        const active = pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onNavigate}
                                className={`block rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                                    active
                                        ? 'bg-black text-white shadow-sm'
                                        : 'text-gray-600 hover:bg-gray-100 hover:text-black'
                                }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

export default function DashboardMobileNav({
    isDashboardAdmin = false,
    isSuperAdmin = false,
}: {
    isDashboardAdmin?: boolean;
    isSuperAdmin?: boolean;
}) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    const close = () => setOpen(false);

    const extraLinks: NavItem[] = [
        ...(isDashboardAdmin ? [{ href: '/admin-panel/whatsapp-setup', label: 'WhatsApp' }] : []),
        ...(isSuperAdmin ? [{ href: '/dashboard/settings/roles', label: 'Ruoli' }] : []),
        { href: '/dashboard/profile', label: 'Profilo' },
    ];

    return (
        <div className="md:hidden">
            <button
                type="button"
                aria-label={open ? 'Chiudi menu' : 'Apri menu'}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {open ? (
                <div className="fixed inset-0 z-50">
                    <button
                        type="button"
                        aria-label="Chiudi menu"
                        className="absolute inset-0 bg-black/40"
                        onClick={close}
                    />
                    <div className="absolute right-0 top-0 flex h-full w-[min(88vw,320px)] flex-col bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                            <span className="text-sm font-semibold text-gray-900">Menu</span>
                            <button
                                type="button"
                                aria-label="Chiudi menu"
                                onClick={close}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5">
                            {PRIMARY_LINKS.map((item) => (
                                <MobileNavLink key={item.href} {...item} onNavigate={close} />
                            ))}

                            {isDashboardAdmin ? (
                                <MobileNavAccordion
                                    label="Sistema"
                                    items={SISTEMA_LINKS}
                                    onNavigate={close}
                                />
                            ) : null}

                            {extraLinks.length > 0 ? (
                                <div className="mt-4 border-t border-gray-100 pt-4 space-y-1.5">
                                    {extraLinks.map((item) => (
                                        <MobileNavLink key={item.href} {...item} onNavigate={close} />
                                    ))}
                                </div>
                            ) : null}
                        </nav>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

