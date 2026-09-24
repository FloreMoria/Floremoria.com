import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
            return NextResponse.json({ error: 'Nessun file fornito per il caricamento.' }, { status: 400 });
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
        const outRelDir = '/media/social/momo/uploads';
        const outAbsDir = path.join(process.cwd(), 'public', outRelDir);

        fs.mkdirSync(outAbsDir, { recursive: true });
        const outAbsPath = path.join(outAbsDir, filename);
        fs.writeFileSync(outAbsPath, buffer);

        const relPath = `${outRelDir}/${filename}`;
        const isVideo =
            file.type.startsWith('video/') ||
            /\.(mp4|mov|webm|m4v|qt|avi|mkv)$/i.test(ext);

        return NextResponse.json({
            ok: true,
            path: relPath,
            name: originalName,
            size: file.size,
            type: isVideo ? 'video' : 'image',
        });
    } catch (err) {
        console.error('[MOMO Upload] Error handling file upload:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Errore interno durante il salvataggio del file' },
            { status: 500 }
        );
    }
}
