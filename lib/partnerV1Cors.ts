function accessControlAllowOrigin(request: Request): string | null {
    if (process.env.NODE_ENV === 'development') return '*';
    const raw = process.env.PARTNER_INBOUND_CORS_ORIGIN?.trim();
    if (!raw || raw === 'none') return null;
    if (raw === '*') return '*';
    const origin = request.headers.get('origin');
    const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && allowed.includes(origin)) return origin;
    return null;
}

export function partnerV1CorsHeaders(request: Request, methods: string): HeadersInit {
    const acao = accessControlAllowOrigin(request);
    const base: Record<string, string> = {
        'Access-Control-Allow-Methods': methods,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Partner-Key',
        'Access-Control-Max-Age': '86400',
    };
    if (acao) base['Access-Control-Allow-Origin'] = acao;
    return base;
}
