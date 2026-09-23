import React from 'react';
import CampaignsDashboardClient from '../campaigns/CampaignsDashboardClient';

export const metadata = {
    title: 'Social & Campagne · FloreMoria',
    description:
        'Command Center Social: Campagne automatiche, metriche live, TikTok/Meta/YT e MOMO Video Engine.',
};

export default function DashboardSocialPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-7xl">
            <CampaignsDashboardClient />
        </div>
    );
}

