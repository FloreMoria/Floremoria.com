import type { Viewport } from 'next';
import type { ReactNode } from 'react';

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: '#FAF9F6',
};

export default function FioristaLayout({ children }: { children: ReactNode }) {
    return children;
}
