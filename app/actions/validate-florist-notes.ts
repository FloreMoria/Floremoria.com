'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
    findMatchingDeceasedProfile,
    resolveDeceasedProfileForOrder,
} from '@/lib/deceased/deceasedProfileIdentity';

export async function validateFloristNote(deliveryProofId: string, deceasedName: string, cemeteryCity: string, cemeteryName: string | null, validatedNotes: string) {
    try {
        const code = `DEF-${cemeteryCity.substring(0,2).toUpperCase()}-${Date.now().toString().slice(-4)}`;

        let deceasedProfile = await findMatchingDeceasedProfile(deceasedName, cemeteryCity);

        if (!deceasedProfile) {
            const profileId = await resolveDeceasedProfileForOrder({
                deceasedName,
                cemeteryCity,
                cemeteryName,
            });
            deceasedProfile = await prisma.deceasedProfile.update({
                where: { id: profileId },
                data: {
                    uniqueCode: code,
                    verifiedNotes: validatedNotes,
                },
            });
        } else {
            deceasedProfile = await prisma.deceasedProfile.update({
                where: { id: deceasedProfile.id },
                data: {
                    verifiedNotes: validatedNotes,
                    ...(cemeteryName && !deceasedProfile.cemeteryName
                        ? { cemeteryName }
                        : {}),
                },
            });
        }

        // 2. Associa il DeceasedProfile all'Ordine associato a questa DeliveryProof
        const deliveryProof = await prisma.deliveryProof.findUnique({
            where: { id: deliveryProofId },
            include: { order: true }
        });

        if (deliveryProof && deliveryProof.order) {
            await prisma.order.update({
                where: { id: deliveryProof.order.id },
                data: {
                    deceasedProfileId: deceasedProfile.id
                }
            });
        }

        revalidatePath('/dashboard'); // Aggiorniamo la UI Admin
        return { success: true, profileId: deceasedProfile.id };
    } catch (e) {
        console.error('Failed to validate florist note:', e);
        return { success: false, error: 'Database error' };
    }
}
