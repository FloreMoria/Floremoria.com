import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
    title: 'Finanza & Contabilità',
};

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
