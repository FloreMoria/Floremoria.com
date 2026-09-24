import { NextRequest, NextResponse } from 'next/server';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150 MB

export async function POST(req: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
            return NextResponse.json(
                { ok: false, error: 'Nessun file fornito per il caricamento.' },
                { status: 400 }
            );
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `Dimensione file (${Math.round(file.size / (1024 * 1024))}MB) supera il limite massimo di 150MB.`,
                },
                { status: 413 }
            );
        }

        const originalName = file.name || 'upload.mp4';
        const buffer = Buffer.from(await file.arrayBuffer());

        // Estrazione sicura dell'estensione senza regex rigide
        const dotIdx = originalName.lastIndexOf('.');
        let ext = dotIdx !== -1 ? originalName.slice(dotIdx).toLowerCase() : '';
        if (!ext) {
            ext = file.type.startsWith('image') ? '.jpg' : '.mp4';
        }

        // Sanitizzazione nome file pulito
        const baseName = dotIdx !== -1 ? originalName.slice(0, dotIdx) : originalName;
        const cleanBase = baseName
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 40) || 'media';

        const filename = `${Date.now()}_${cleanBase}${ext}`;
        const isVideo =
            file.type.startsWith('video/') ||
            /\.(mp4|mov|webm|m4v|qt|avi|mkv)$/i.test(ext);

        const mimeType =
            file.type || (isVideo ? 'video/mp4' : ext === '.png' ? 'image/png' : 'image/jpeg');

        // 1. Prova prima il caricamento su Vercel Blob (consigliato per serverless)
        if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
            try {
                const blobPath = `marketing/momo/uploads/${filename}`;
                const blobResult = await putBlobWithAccessFallback(blobPath, buffer, {
                    contentType: mimeType,
                    addRandomSuffix: true,
                    token: process.env.BLOB_READ_WRITE_TOKEN.trim(),
                });

                return NextResponse.json({
                    ok: true,
                    path: blobResult.url,
                    url: blobResult.url,
                    name: originalName,
                    size: file.size,
                    type: isVideo ? 'video' : 'image',
                });
            } catch (blobErr) {
                console.warn('[MOMO Upload] Vercel Blob upload warning, falling back to /tmp:', blobErr);
            }
        }

        // 2. Fallback per ambiente locale o assenza token: scrivi nella cartella temporanea di sistema (/tmp)
        const tmpDir = path.join(os.tmpdir(), 'momo-uploads');
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmpPath = path.join(tmpDir, filename);
        fs.writeFileSync(tmpPath, buffer);

        return NextResponse.json({
            ok: true,
            path: tmpPath,
            url: tmpPath,
            name: originalName,
            size: file.size,
            type: isVideo ? 'video' : 'image',
        });
    } catch (err) {
        console.error('[MOMO Upload] Error handling file upload:', err);
        return NextResponse.json(
            {
                ok: false,
                error: err instanceof Error ? err.message : 'Errore interno durante il caricamento del file',
            },
            { status: 500 }
        );
    }
}
