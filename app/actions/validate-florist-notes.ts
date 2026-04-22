'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function validateFloristNote(deliveryProofId: string, deceasedName: string, cemeteryCity: string, cemeteryName: string | null, validatedNotes: string) {
    try {
        // 1. Cerca il DeceasedProfile o crealo
        // In un caso reale potremmo dover stabilire una stringa uniqueCode migliore
        const code = `DEF-${cemeteryCity.substring(0,2).toUpperCase()}-${Date.now().toString().slice(-4)}`;
        
        let deceasedProfile = await prisma.deceasedProfile.findFirst({
            where: { 
                fullName: deceasedName,
                cemeteryCity: cemeteryCity
            }
        });

        if (!deceasedProfile) {
            deceasedProfile = await prisma.deceasedProfile.create({
                data: {
                    uniqueCode: code,
                    fullName: deceasedName,
                    cemeteryCity: cemeteryCity,
                    cemeteryName: cemeteryName,
                    verifiedNotes: validatedNotes
                }
            });
        } else {
            // Aggiorna le note validate se esiste già
            deceasedProfile = await prisma.deceasedProfile.update({
                where: { id: deceasedProfile.id },
                data: {
                    verifiedNotes: validatedNotes,
                }
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
