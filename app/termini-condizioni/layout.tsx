import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const TIKTOK_SITE_VERIFICATION_CODE = 's25YbsdBedcdN5ME5WVecDUCIu6P7Zys';
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
