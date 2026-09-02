import type { Metadata } from 'next';
import AiVisibilityReportClient from '@/components/dashboard/AiVisibilityReportClient';
import { buildAiVisibilityReportPayload } from '@/lib/seo/aiVisibilityBenchmark';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Audit Visibilità AI (AEO/GEO)',
};

export default function AiVisibilityAuditPage() {
    const report = buildAiVisibilityReportPayload();
    return <AiVisibilityReportClient report={report} />;
}
