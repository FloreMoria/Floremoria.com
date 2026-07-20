/**
 * Staff API: lettura / scrittura skill social + import da GitHub.
 * Non tocca i file master dei 22 Agent in agents/*_master.md.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isDashboardAdminRole } from '@/lib/superAdmin';
import {
    injectSkillsIntoSystemPrompt,
    isSocialSkillId,
    listSocialSkills,
    loadSkillMarkdown,
    writeSkillMarkdown,
    type SocialSkillId,
} from '@/src/agents/skillsLoader';
import {
    importSkillFromGithubUrl,
    searchGithubSocialSkills,
} from '@/src/agents/tools/githubSkillImporter';

export const runtime = 'nodejs';

async function requireStaff(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
    const cookieStore = await cookies();
    const role = cookieStore.get('fm_user_role')?.value;
    if (!isDashboardAdminRole(role)) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, message: 'Non autorizzato. Solo staff dashboard.' },
                { status: 403 }
            ),
        };
    }
    return { ok: true };
}

/** GET — elenco skill; ?id=… per contenuto; ?previewPrompt=1&ids=… per dry-run inject. */
export async function GET(request: Request) {
    const auth = await requireStaff();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id')?.trim();
        const previewPrompt = searchParams.get('previewPrompt') === '1';
        const idsParam = searchParams.get('ids');

        if (previewPrompt) {
            const ids = (idsParam || '')
                .split(',')
                .map((s) => s.trim())
                .filter(isSocialSkillId);
            const prompt = await injectSkillsIntoSystemPrompt(
                'SYSTEM_PROMPT_BASE_PLACEHOLDER',
                ids.length > 0 ? ids : (['instagram_skills'] as SocialSkillId[])
            );
            return NextResponse.json({ success: true, prompt });
        }

        if (id) {
            if (!isSocialSkillId(id)) {
                return NextResponse.json(
                    { success: false, message: `Skill id non valido: ${id}` },
                    { status: 400 }
                );
            }
            const content = await loadSkillMarkdown(id);
            return NextResponse.json({
                success: true,
                skill: { id, filename: `${id}.md`, content },
            });
        }

        const skills = await listSocialSkills();
        return NextResponse.json({ success: true, skills });
    } catch (error) {
        console.error('[agents/skills GET]', error);
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : 'Errore lettura skill.',
            },
            { status: 500 }
        );
    }
}

/**
 * PUT — aggiorna contenuto markdown di una skill.
 * Body: { skillId, content }
 */
export async function PUT(request: Request) {
    const auth = await requireStaff();
    if (!auth.ok) return auth.response;

    try {
        const body = (await request.json()) as { skillId?: string; content?: string };
        const skillId = typeof body.skillId === 'string' ? body.skillId.trim() : '';
        const content = typeof body.content === 'string' ? body.content : '';

        if (!isSocialSkillId(skillId)) {
            return NextResponse.json(
                { success: false, message: 'skillId non valido o mancante.' },
                { status: 400 }
            );
        }
        if (!content.trim()) {
            return NextResponse.json(
                { success: false, message: 'content obbligatorio.' },
                { status: 400 }
            );
        }

        await writeSkillMarkdown(skillId, content);
        return NextResponse.json({
            success: true,
            message: `Skill ${skillId} aggiornata.`,
            skill: { id: skillId, filename: `${skillId}.md` },
        });
    } catch (error) {
        console.error('[agents/skills PUT]', error);
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : 'Errore salvataggio skill.',
            },
            { status: 500 }
        );
    }
}

/**
 * POST — azioni staff:
 *  - { action: "import", skillId, githubUrl }
 *  - { action: "search", query?, perPage? }
 */
export async function POST(request: Request) {
    const auth = await requireStaff();
    if (!auth.ok) return auth.response;

    try {
        const body = (await request.json()) as {
            action?: string;
            skillId?: string;
            githubUrl?: string;
            query?: string;
            perPage?: number;
        };

        const action = typeof body.action === 'string' ? body.action.trim() : '';

        if (action === 'import') {
            const skillId = typeof body.skillId === 'string' ? body.skillId.trim() : '';
            const githubUrl = typeof body.githubUrl === 'string' ? body.githubUrl.trim() : '';
            if (!skillId || !githubUrl) {
                return NextResponse.json(
                    { success: false, message: 'skillId e githubUrl sono obbligatori per import.' },
                    { status: 400 }
                );
            }
            const result = await importSkillFromGithubUrl({ skillId, githubUrl });
            return NextResponse.json({
                success: true,
                message: `Skill ${result.skillId} importata da GitHub.`,
                import: result,
            });
        }

        if (action === 'search') {
            const result = await searchGithubSocialSkills({
                query: body.query,
                perPage: body.perPage,
            });
            return NextResponse.json({ success: true, search: result });
        }

        return NextResponse.json(
            {
                success: false,
                message: 'action non valida. Usa "import" o "search".',
            },
            { status: 400 }
        );
    } catch (error) {
        console.error('[agents/skills POST]', error);
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : 'Errore operazione skill.',
            },
            { status: 500 }
        );
    }
}
