import { NextResponse } from 'next/server';
import { createYoudoxClient } from '@/lib/youdox/client';
import { requireYoudoxApiAccess } from '@/lib/youdox/requireAccess';

/**
 * POST /api/v1/finance/youdox/invoices/send
 * Body: { xmlBase64, filename, pleaseValidate?, asZip? }
 * Mappa: Exchange_ImportXMLToSend | Exchange_ImportZipXMLPackToSend
 */
export async function POST(request: Request) {
    const access = await requireYoudoxApiAccess(request);
    if (!access.ok) return access.response;

    try {
        const body = (await request.json()) as {
            xmlBase64?: string;
            filename?: string;
            pleaseValidate?: boolean;
            asZip?: boolean;
        };

        if (!body.xmlBase64 || !body.filename?.trim()) {
            return NextResponse.json(
                { ok: false, error: 'xmlBase64 e filename obbligatori' },
                { status: 400 }
            );
        }

        const buf = Buffer.from(body.xmlBase64, 'base64');
        if (!buf.length) {
            return NextResponse.json({ ok: false, error: 'xmlBase64 vuoto o non valido' }, { status: 400 });
        }

        const client = createYoudoxClient();
        const pleaseValidate = body.pleaseValidate !== false;

        if (body.asZip) {
            const results = await client.importZipXmlPackToSend(buf, pleaseValidate);
            return NextResponse.json({ ok: true, results });
        }

        const result = await client.importXmlToSend(buf, body.filename.trim(), pleaseValidate);
        return NextResponse.json({ ok: true, result });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Invio YouDOX fallito';
        console.error('[youdox/send]', message);
        const status = message.includes('Config assente') ? 503 : message.includes('non ancora cablato') ? 501 : 502;
        return NextResponse.json({ ok: false, error: message }, { status });
    }
}
