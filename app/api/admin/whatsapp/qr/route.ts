/**
 * GET /api/admin/whatsapp/qr
 *
 * Proxy autenticato (SUPER_ADMIN) verso Evolution API per recuperare il QR code
 * di collegamento dell'istanza al numero iPhone 12 di FloreMoria.
 *
 * Risposta:
 *   { ok: true, qrCodeBase64: "..." }   → QR pronto, mostra l'immagine
 *   { ok: true, state: "open" }         → già connesso, nessun QR necessario
 *   { ok: false, error: "..." }         → errore
 */
import { NextResponse } from 'next/server';
import { getEvolutionQrCode, getEvolutionInstanceState } from '@/lib/whatsapp/evolutionApiClient';
import { requireSuperAdminApi } from '@/lib/superAdminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
    // Protezione: solo SUPER_ADMIN
    const guardResult = await requireSuperAdminApi();
    if (guardResult) return guardResult;

    // Controlla prima lo stato: se già connesso non serve il QR
    const stateResult = await getEvolutionInstanceState();
    if (stateResult.state === 'open') {
        return NextResponse.json({ ok: true, state: 'open', message: 'Istanza già connessa' });
    }

    // Richiedi il QR code
    const qrResult = await getEvolutionQrCode();
    if (!qrResult.ok) {
        return NextResponse.json(
            { ok: false, error: qrResult.error ?? 'evolution_api_error' },
            { status: 502 }
        );
    }

    return NextResponse.json({
        ok: true,
        state: stateResult.state ?? 'connecting',
        qrCodeBase64: qrResult.qrCodeBase64,
    });
}
