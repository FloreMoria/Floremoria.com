'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import FloatingWhatsAppButton from '@/components/FloatingWhatsAppButton';

interface ConditionalLayoutProps {
    children: React.ReactNode;
    footer: React.ReactNode;
}

export default function ConditionalLayout({ children, footer }: ConditionalLayoutProps) {
    const pathname = usePathname();

    // Le rotte applicative pure (Dashboard, Login, Admin) non devono avere Navbar pubblica o Footer,
    // né devono sottostare al "max-w" tipico dei blog.
    const isAppRoute = pathname?.startsWith('/dashboard') || pathname?.startsWith('/login') || pathname?.startsWith('/admin');
    const isPrintRoute = pathname?.startsWith('/stampa');
    const isPartnerDocsRoute = pathname?.startsWith('/docs/partner-api');

    if (isAppRoute || isPrintRoute || isPartnerDocsRoute) {
        return (
            <main className="flex-grow flex flex-col w-full h-full overflow-hidden">
                {children}
            </main>
        );
    }

    // Rotte standard del sito pubblico E-commerce
    return (
        <>
            <Navbar />
            <main className="flex-grow w-full max-w-[1200px] mx-auto px-[20px] lg:px-[32px] py-12 lg:py-20 mt-[72px]">
                {children}
            </main>
            <FloatingWhatsAppButton />
            {footer}
        </>
    );
}
