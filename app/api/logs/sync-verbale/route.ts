import { readFileSync, existsSync } from 'node:fs';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { syncVerbaleToFloremoriaLog } from '@/lib/verbali/syncVerbaleToFloremoriaLog';
import { docsVerbalePath, obsidianGiornalieroRel } from '@/lib/verbali/paths';

function isAuthorized(request: Request): boolean {
    const webhookKey = process.env.FLOREMORIA_WEBHOOK_KEY?.trim();
    const adminKey = process.env.ADMIN_API_KEY?.trim();
    const apiKeyHeader = request.headers.get('x-api-key')?.trim();
    const adminKeyHeader = request.headers.get('x-admin-key')?.trim();
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const bearer = authHeader?.replace(/^Bearer\s/i, '').trim();

    if (webhookKey && (apiKeyHeader === webhookKey || bearer === webhookKey)) return true;
    if (adminKey && adminKeyHeader === adminKey) return true;
    return false;
}

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
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
        console.error('API /api/logs/sync-verbale:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
