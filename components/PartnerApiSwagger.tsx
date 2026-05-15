'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import spec from '@/lib/openapi/partner-v1.openapi.json';

const SwaggerUI = dynamic(async () => (await import('swagger-ui-react')).default, { ssr: false });

export default function PartnerApiSwagger() {
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    if (!ready) {
        return <div className="p-6 text-sm text-neutral-600">Caricamento documentazione API…</div>;
    }
    return <SwaggerUI spec={spec as object} deepLinking docExpansion="list" />;
}
