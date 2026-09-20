import React from 'react';
import MomoVideoPanel from '@/components/dashboard/MomoVideoPanel';

export const metadata = {
    title: 'Social · MOMO',
    description:
        'Cabina social FloreMoria: documentari monumentali MOMO 9:16 e pubblicazione Shorts/Reels/TikTok/Facebook.',
};

export default function DashboardSocialPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-5xl space-y-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight">
                    Social & Monumental Memory
                </h1>
                <p className="mt-1 text-sm text-stone-600 max-w-2xl">
                    Area Contenuti: MOMO per video su monumenti reali. Per campagne retail/Ziggy
                    resta{' '}
                    <a href="/dashboard/campaigns" className="underline underline-offset-2">
                        /dashboard/campaigns
                    </a>
                    .
                </p>
            </div>
            <MomoVideoPanel />
        </div>
    );
}
