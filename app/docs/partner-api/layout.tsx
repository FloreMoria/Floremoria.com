import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Partner API (OpenAPI) · FloreMoria',
    robots: { index: false, follow: false },
};

export default function PartnerApiDocsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
