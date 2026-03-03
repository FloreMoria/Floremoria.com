import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    try {
        const roles = await prisma.role.findMany({
            orderBy: { createdAt: 'asc' }
        });
        return NextResponse.json(roles);
    } catch (error) {
        console.error("Error fetching roles:", error);
        return NextResponse.json({ error: 'Errore interno Server' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, permissions } = body;

        if (!name) {
            return NextResponse.json({ error: 'Il nome del ruolo è obbligatorio' }, { status: 400 });
        }

        const newRole = await prisma.role.create({
            data: {
                name,
                permissions: permissions || {},
                isSystem: false // creati da UI sono custom
            }
        });

        return NextResponse.json(newRole, { status: 201 });
    } catch (error) {
        console.error("Error creating role:", error);
        return NextResponse.json({ error: 'Salvatore, questo nome ruolo esiste già o c\'è un errore' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, permissions } = body;

        const role = await prisma.role.findUnique({ where: { id } });

        if (!role) {
            return NextResponse.json({ error: 'Ruolo non trovato.' }, { status: 404 });
        }

        if (role.isSystem && role.name === 'SUPER_ADMIN') {
            return NextResponse.json({ error: 'Il ruolo SUPER_ADMIN è blindato e in sola lettura.' }, { status: 403 });
        }

        const updatedRole = await prisma.role.update({
            where: { id },
            data: {
                permissions
            }
        });

        return NextResponse.json(updatedRole);
    } catch (error) {
        return NextResponse.json({ error: 'Errore durante aggiornamento permessi' }, { status: 500 });
    }
}
