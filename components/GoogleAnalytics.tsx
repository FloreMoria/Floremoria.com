'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

/** Measurement ID GA4 (tag gtag.js) — imposta NEXT_PUBLIC_GA_MEASUREMENT_ID su Vercel. */
const GA_MEASUREMENT_ID =
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || 'G-GVL7FSLBDK';

/**
 * Google tag sul sito pubblico (pagine marketing / checkout / ordine completato).
 * Non carica su dashboard, login o admin-panel.
 */
export default function GoogleAnalytics() {
    const pathname = usePathname();

    const skip =
        !GA_MEASUREMENT_ID ||
        pathname?.startsWith('/dashboard') ||
        pathname?.startsWith('/login') ||
        pathname?.startsWith('/admin-panel') ||
        pathname?.startsWith('/admin') ||
        pathname?.startsWith('/docs/partner-api');

    if (skip) {
        return null;
    }

    return (
        <>
            <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
                strategy="afterInteractive"
            />
            <Script id="google-analytics-init" strategy="afterInteractive">
                {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
            </Script>
        </>
    );
}
