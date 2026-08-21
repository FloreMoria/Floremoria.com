/**
 * POST: genera XML autofattura TD17/TD18, salva spesa Contabilità, restituisce XML per download.
 */

import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    allocateAutofatturaEstSequence,
    generateAutofatturaXml,
    getVendorPreset,
    AUTOFATTURA_VENDOR_PRESETS,
    type AutofatturaDocType,
} from '@/lib/financial/generateAutofatturaXml';
import { registerGeneratedAutofattura } from '@/lib/financial/registerGeneratedAutofattura';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(error: string, status: number) {
    return NextResponse.json({ ok: false, error }, { status });
}

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    return NextResponse.json({
        ok: true,
        presets: AUTOFATTURA_VENDOR_PRESETS.map((p) => ({
            id: p.id,
            label: p.label,
            denominazione: p.denominazione,
            idPaese: p.idPaese,
            defaultDocType: p.defaultDocType,
            defaultDescrizione: p.defaultDescrizione,
        })),
    });
}

export async function POST(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        const body = await request.json().catch(() => ({}));
        const vendorId = String(body.vendorId || '').trim();
        const vendor = getVendorPreset(vendorId);
        if (!vendor) {
            return jsonError(
                'Fornitore non valido. Usa un preset: openai, vercel, google, stripe, meta.',
                400
            );
        }

        const docTypeRaw = String(body.docType || vendor.defaultDocType).toUpperCase();
        const docType: AutofatturaDocType = docTypeRaw === 'TD18' ? 'TD18' : 'TD17';
        const foreignInvoiceNumber = String(body.foreignInvoiceNumber || '').trim();
        const foreignInvoiceDate = String(body.foreignInvoiceDate || '').slice(0, 10);
        const autofatturaDate =
            String(body.autofatturaDate || foreignInvoiceDate || '').slice(0, 10) ||
            new Date().toISOString().slice(0, 10);
        const imponibileEur = Number(String(body.imponibileEur ?? '').replace(',', '.'));
        const descrizioneLinea =
            typeof body.descrizioneLinea === 'string' && body.descrizioneLinea.trim()
                ? body.descrizioneLinea.trim()
                : undefined;
        const persist = body.persist !== false;

        if (!foreignInvoiceNumber) {
            return jsonError('Numero fattura estera originale obbligatorio', 400);
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(foreignInvoiceDate)) {
            return jsonError('Data fattura estera non valida (YYYY-MM-DD)', 400);
        }
        if (!Number.isFinite(imponibileEur) || imponibileEur <= 0) {
            return jsonError('Totale imponibile (€) non valido', 400);
        }

        const seq = await allocateAutofatturaEstSequence(
            Number(autofatturaDate.slice(0, 4)) || new Date().getFullYear()
        );

        const generated = generateAutofatturaXml({
            docType,
            autofatturaDate,
            foreignInvoiceNumber,
            foreignInvoiceDate,
            imponibileCents: Math.round(imponibileEur * 100),
            vendor,
            descrizioneLinea,
            documentNumber: seq.documentNumber,
            progressivoInvio: seq.progressivoInvio,
        });

        let expenseId: string | null = null;
        let matchedFineco = false;
        if (persist) {
            const registered = await registerGeneratedAutofattura({
                generated,
                vendor,
                autofatturaDate,
                foreignInvoiceNumber,
                foreignInvoiceDate,
            });
            expenseId = registered.expenseId;
            matchedFineco = registered.matchedFineco;
        }

        return NextResponse.json({
            ok: true,
            message:
                `XML ${generated.docType} ${generated.documentNumber} generato` +
                (persist
                    ? matchedFineco
                        ? ' · registrato in Contabilità e abbinato a Fineco'
                        : ' · registrato in Contabilità (Fineco da abbinare)'
                    : ''),
            fileName: generated.fileName,
            xml: generated.xml,
            documentNumber: generated.documentNumber,
            progressivoInvio: generated.progressivoInvio,
            imponibileCents: generated.imponibileCents,
            vatCents: generated.vatCents,
            totaleCents: generated.totaleCents,
            expenseId,
            matchedFineco,
            codiceDestinatario: 'K0ROACV',
        });
    } catch (error) {
        console.error('[autofatture generate]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Generazione autofattura fallita',
            500
        );
    }
}
