import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

/**
 * Audit trail Admin/Super Admin: chi ha cambiato cosa, prima/dopo.
 * Perché: tracciare isTest / cancellationCause e campi rete senza dipendere dai soli log Vercel.
 */
export async function writeAdminFieldChangeLog(input: {
    actorUserId: string;
    actorRole: string;
    entityType: string;
    entityId: string;
    field: string;
    before: unknown;
    after: unknown;
}): Promise<void> {
    await prisma.adminFieldChangeLog.create({
        data: {
            actorUserId: input.actorUserId,
            actorRole: input.actorRole.slice(0, 40),
            entityType: input.entityType.slice(0, 64),
            entityId: input.entityId,
            field: input.field.slice(0, 120),
            beforeJson: toJson(input.before),
            afterJson: toJson(input.after),
        },
    });
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
}
