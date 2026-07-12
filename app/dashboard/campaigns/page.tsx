import React from 'react';
import CampaignsDashboardClient from './CampaignsDashboardClient';

export const metadata = {
  title: 'Social Control & Campaigns | FloreMoria Dashboard',
  description: 'Manage and oversee automatic social campaigns, editorial themes and metrics.',
};

export default function CampaignsPage() {
  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-7xl">
      <CampaignsDashboardClient />
    </div>
  );
}
