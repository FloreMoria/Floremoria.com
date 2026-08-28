'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import FloatingWhatsAppButton from '@/components/FloatingWhatsAppButton';
import WhatsAppMaintenanceBanner from '@/components/WhatsAppMaintenanceBanner';
import MobileAppHeader from '@/components/mobile/MobileAppHeader';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import PwaPublicRegister from '@/components/mobile/PwaPublicRegister';
import {
    WHATSAPP_MAINTENANCE_BANNER_ENABLED,
    WHATSAPP_MAINTENANCE_BANNER_OFFSET,
} from '@/lib/site/maintenanceBanner';

interface ConditionalLayoutProps {
    children: React.ReactNode;
    footer: React.ReactNode;
}

export default function ConditionalLayout({ children, footer }: ConditionalLayoutProps) {
    const pathname = usePathname();

    // Le rotte applicative pure (Dashboard, Login, Admin) non devono avere Navbar pubblica o Footer,
    // né devono sottostare al "max-w" tipico dei blog.
    const isAppRoute =
        pathname?.startsWith('/dashboard') ||
        pathname?.startsWith('/login') ||
        pathname?.startsWith('/admin-panel') ||
        pathname?.startsWith('/admin') ||
        pathname?.startsWith('/fiorista') ||
        pathname?.startsWith('/partner/upload') ||
        pathname?.startsWith('/auth');
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
    const bannerOffset = WHATSAPP_MAINTENANCE_BANNER_ENABLED ? WHATSAPP_MAINTENANCE_BANNER_OFFSET : '0px';

    return (
        <div style={{ '--fm-maint-banner-h': bannerOffset } as React.CSSProperties}>
            <PwaPublicRegister />
            {WHATSAPP_MAINTENANCE_BANNER_ENABLED && <WhatsAppMaintenanceBanner />}
            <MobileAppHeader />
            <Navbar />
            <main className="flex-grow w-full max-w-[1200px] mx-auto px-[16px] sm:px-[20px] lg:px-[32px] py-6 md:py-12 lg:py-20 mt-[calc(3.5rem+var(--fm-maint-banner-h,0px)+env(safe-area-inset-top,0px))] md:mt-[calc(72px+var(--fm-maint-banner-h,0px))] pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:pb-0">
                {children}
            </main>
            <MobileBottomNav />
            {!WHATSAPP_MAINTENANCE_BANNER_ENABLED && <FloatingWhatsAppButton />}
            {footer}
        </div>
    );
}
