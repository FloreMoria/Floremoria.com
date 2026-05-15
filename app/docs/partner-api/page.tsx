'use client';

import 'swagger-ui-react/swagger-ui.css';
import PartnerApiSwagger from '@/components/PartnerApiSwagger';

export default function PartnerApiDocsPage() {
    return (
        <div className="min-h-screen bg-white">
            <PartnerApiSwagger />
        </div>
    );
}
