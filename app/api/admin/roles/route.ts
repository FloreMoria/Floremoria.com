import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isBlockedSuperAdminAssignment } from '@/lib/superAdmin';
import { requireSuperAdminApi } from '@/lib/superAdminAuth';

export async function GET() {
    const denied = await requireSuperAdminApi();
    if (denied) return denied;

    try {
        const roles = await prisma.role.findMany({ orderBy: { createdAt: 'asc' } });
        return NextResponse.json(roles);
    } catch (error) {
        console.error('Error fetching roles:', error);
        return NextResponse.json({ error: 'Errore interno Server' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const denied = await requireSuperAdminApi();
    if (denied) return denied;

    try {
        const body = await request.json();
        const { name, permissions } = body;

        if (!name) {
            return NextResponse.json({ error: 'Il nome del ruolo è obbligatorio' }, { status: 400 });
        }

        if (isBlockedSuperAdminAssignment(name)) {
            return NextResponse.json(
                { error: 'Non è possibile creare un ruolo SUPER_ADMIN dalla dashboard.' },
                { status: 403 }
            );
        }

        const newRole = await prisma.role.create({
            data: {
                name: String(name).trim(),
                permissions: permissions || {},
                isSystem: false,
            },
        });

        return NextResponse.json(newRole, { status: 201 });
    } catch (error) {
        console.error('Error creating role:', error);
        return NextResponse.json(
            { error: "Salvatore, questo nome ruolo esiste già o c'è un errore" },
            { status: 500 }
        );
    }
}

export async function PUT(request: Request) {
    const denied = await requireSuperAdminApi();
    if (denied) return denied;

    try {
        const body = await request.json();
        const { id, permissions } = body;

        const role = await prisma.role.findUnique({ where: { id } });

        if (!role) {
            return NextResponse.json({ error: 'Ruolo non trovato.' }, { status: 404 });
        }

        if (isBlockedSuperAdminAssignment(role.name)) {
            return NextResponse.json(
                { error: 'Il ruolo SUPER_ADMIN è blindato e in sola lettura.' },
                { status: 403 }
            );
        }

        const updatedRole = await prisma.role.update({
            where: { id },
            data: { permissions },
        });

        return NextResponse.json(updatedRole);
    } catch {
        return NextResponse.json({ error: 'Errore durante aggiornamento permessi' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const denied = await requireSuperAdminApi();
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID ruolo mancante.' }, { status: 400 });
        }

        const role = await prisma.role.findUnique({ where: { id } });

        if (!role) {
            return NextResponse.json({ error: 'Ruolo non trovato.' }, { status: 404 });
        }

        if (role.isSystem) {
            return NextResponse.json({ error: 'Non puoi eliminare un ruolo di sistema.' }, { status: 403 });
        }

        await prisma.role.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting role:', error);
        return NextResponse.json({ error: 'Errore durante eliminazione ruolo' }, { status: 500 });
    }
}
