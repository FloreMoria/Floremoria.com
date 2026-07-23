import prisma from '@/lib/prisma';
import { setVeraOperationalAlert } from '@/lib/vera/operationalAlerts';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { sendWhatsAppTextMessage, normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';

export type FloristExceptionType = 'tomb_not_found' | 'cemetery_closed';

const TOMB_NOT_FOUND_PATTERN =
    /tomba\s+non\s+trovata|non\s+trovo\s+la\s+tomba|tomba\s+assente|posizione\s+sbagliata/i;

const CEMETERY_CLOSED_PATTERN =
    /cimitero\s+chiuso|chiuso\s+il\s+cimitero|non\s+aperto|porta\s+chiusa/i;

const USER_MODIFICATION_PATTERN =
    /modific|cambiar|spostar|orario|nastro|bigliett|messaggio|ritard|anticip|variet[aà]|fiori|colore|anthurium|gigli|rosa|consegna\s+(domani|il|per)|onomastic|data\s+di\s+consegna|preferisc/i;

export function detectFloristException(message: string): FloristExceptionType | null {
    if (TOMB_NOT_FOUND_PATTERN.test(message)) return 'tomb_not_found';
    if (CEMETERY_CLOSED_PATTERN.test(message)) return 'cemetery_closed';
    return null;
}

export function isUserModificationRequest(message: string): boolean {
    return USER_MODIFICATION_PATTERN.test(message);
}

export async function resolveActiveFloristOrder(partnerId: string) {
    return prisma.order.findFirst({
        where: {
            partnerId,
            deletedAt: null,
            partnerPaymentStatus: 'PAID',
            status: { in: ['ACCEPTED', 'IN_PROGRESS', 'PENDING'] },
            // Include ordini senza DeliveryProof ancora creato (is: escludeva i null).
            OR: [
                { deliveryProof: { is: null } },
                { deliveryProof: { is: { status: { not: 'COMPLETED' } } } },
            ],
        },
        orderBy: { updatedAt: 'desc' },
        include: { partner: true, user: { select: { name: true } } },
    });
}

export async function handleFloristException(input: {
    partnerId: string;
    message: string;
    type: FloristExceptionType;
}): Promise<{ handled: boolean; orderId?: string }> {
    const order = await resolveActiveFloristOrder(input.partnerId);
    if (!order) return { handled: false };

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    const orderCode = order.orderNumber || order.id;

    if (input.type === 'tomb_not_found') {
        if (isWorkflowStepDone(flags, 'exception_tomb')) {
            return { handled: true, orderId: order.id };
        }

        if (order.partner?.whatsappNumber) {
            await sendVeraTemplate(order.partner.whatsappNumber, 'florist_tomb_not_found', [
                orderCode,
                order.deceasedName,
            ]);
        }

        const customerPhone = normalizePhoneE164(order.customerPhone);
        if (customerPhone) {
            const name = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
            await sendWhatsAppTextMessage(
                customerPhone,
                `Gentile ${name || 'Utente'}, il fiorista non ha individuato la tomba per l'ordine ${orderCode}. ` +
                    'Potrebbe indicarci con precisione settore, fila e numero? La ringraziamo.'
            );
        }

        await setVeraOperationalAlert({
            orderId: order.id,
            type: 'tomb_not_found',
            message: `Fiorista segnala tomba non trovata — ordine ${orderCode}.`,
            priority: 'urgent',
            freezeOrder: true,
        });

        await prisma.order.update({
            where: { id: order.id },
            data: { veraWorkflowFlags: markWorkflowStep(flags, 'exception_tomb') },
        });
        return { handled: true, orderId: order.id };
    }

    if (input.type === 'cemetery_closed') {
        if (isWorkflowStepDone(flags, 'exception_cemetery')) {
            return { handled: true, orderId: order.id };
        }

        if (order.partner?.whatsappNumber) {
            await sendWhatsAppTextMessage(
                order.partner.whatsappNumber,
                `Ricevuto. Proceda alla consegna il primo giorno utile di apertura del cimitero, aggiornandoci con le foto. Ordine ${orderCode}.`
            );
        }

        const customerPhone = normalizePhoneE164(order.customerPhone);
        if (customerPhone) {
            const name = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
            await sendVeraTemplate(customerPhone, 'customer_cemetery_closed', [
                name || 'Utente',
                order.deceasedName,
                order.cemeteryName,
            ]);
        }

        await setVeraOperationalAlert({
            orderId: order.id,
            type: 'cemetery_closed',
            message: `Cimitero chiuso segnalato dal fiorista — ordine ${orderCode}.`,
            priority: 'high',
        });

        await prisma.order.update({
            where: { id: order.id },
            data: { veraWorkflowFlags: markWorkflowStep(flags, 'exception_cemetery') },
        });
        return { handled: true, orderId: order.id };
    }

    return { handled: false };
}

export async function handleUserModificationRequest(input: {
    orderId: string;
    message: string;
}): Promise<void> {
    await setVeraOperationalAlert({
        orderId: input.orderId,
        type: 'user_modification_request',
        message: `Richiesta modifica utente: ${input.message.slice(0, 280)}`,
        priority: 'high',
        freezeOrder: true,
    });

    const order = await prisma.order.findUnique({
        where: { id: input.orderId },
        select: { veraWorkflowFlags: true },
    });
    const flags = parseWorkflowFlags(order?.veraWorkflowFlags);
    await prisma.order.update({
        where: { id: input.orderId },
        data: {
            veraWorkflowFlags: markWorkflowStep(flags, 'exception_modification'),
            status: 'IN_PROGRESS',
        },
    });
}
