import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const TIKTOK_SITE_VERIFICATION_CODE = 'hn9zw4SN50YfX9FTNwvbXtKINd8Blpzm';
export const TIKTOK_SITE_VERIFICATION_LINE = `tiktok-developers-site-verification=${TIKTOK_SITE_VERIFICATION_CODE}`;

export const metadata: Metadata = {
    verification: {
        other: {
            'tiktok-developers-site-verification': TIKTOK_SITE_VERIFICATION_CODE,
        },
    },
};

export default function TerminiCondizioniLayout({ children }: { children: ReactNode }) {
    return children;
}
