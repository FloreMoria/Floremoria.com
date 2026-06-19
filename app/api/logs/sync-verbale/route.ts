import { readFileSync, existsSync } from 'node:fs';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isVerbaleSyncAuthorized } from '@/lib/auth/verbaleSyncAuth';
import { syncVerbaleToFloremoriaLog } from '@/lib/verbali/syncVerbaleToFloremoriaLog';
import { docsVerbalePath, obsidianGiornalieroRel } from '@/lib/verbali/paths';

export async function GET(request: Request) {
    if (!isVerbaleSyncAuthorized(request.headers)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ ok: true, endpoint: 'sync-verbale', auth: 'valid' });
}

export async function POST(request: Request) {
    if (!isVerbaleSyncAuthorized(request.headers)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        if (body?.dryRun === true) {
            return NextResponse.json({ ok: true, endpoint: 'sync-verbale', auth: 'valid', dryRun: true });
        }

        const iso = typeof body.iso === 'string' ? body.iso.trim() : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
            return NextResponse.json({ error: 'Campo iso obbligatorio (YYYY-MM-DD).' }, { status: 400 });
        }

        let markdown = typeof body.markdown === 'string' ? body.markdown.trim() : '';
        if (!markdown) {
            const path = docsVerbalePath(process.cwd(), iso);
            if (!existsSync(path)) {
                return NextResponse.json(
                    { error: `Verbale assente in docs/verbali per ${iso}.` },
                    { status: 404 }
                );
            }
            markdown = readFileSync(path, 'utf8');
        }

        const result = await syncVerbaleToFloremoriaLog(prisma, {
            iso,
            bodyMarkdown: markdown,
            sourceRelPath: obsidianGiornalieroRel(iso),
            keyPrompt:
                typeof body.keyPrompt === 'string' && body.keyPrompt.trim()
                    ? body.keyPrompt.trim()
                    : undefined,
        });

        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error('API /api/logs/sync-verbale:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
