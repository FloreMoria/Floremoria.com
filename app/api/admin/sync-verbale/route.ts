import { readFileSync, existsSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { checkAdminAuth } from '../auth';
import prisma from '@/lib/prisma';
import { syncVerbaleToFloremoriaLog } from '@/lib/verbali/syncVerbaleToFloremoriaLog';
import { docsVerbalePath, obsidianGiornalieroRel } from '@/lib/verbali/paths';

export async function POST(request: Request) {
    if (!checkAdminAuth(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
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
        console.error('API /api/admin/sync-verbale:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
