    "use server";

    import prisma from '@/lib/prisma';
    import { revalidatePath } from 'next/cache';
    import { writeFile } from 'fs/promises';
    import path from 'path';
    import { randomUUID } from 'crypto';
    import sharp from 'sharp';

    // Helper SEO per generare nomi sicuri e leggibili
    function slugify(text: string): string {
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')           // Sostituisce spazi con -
            .replace(/[^\w\-]+/g, '')       // Rimuove caratteri non parola
            .replace(/\-\-+/g, '-')         // Sostituisce multipli - con un -
            .replace(/^-+/, '')             // Rimuove - all'inizio
            .replace(/-+$/, '');            // Rimuove - alla fine
    }

    // Helper SEO Visual Engine: Conversione in WebP e Naming Intelligente
    async function processAndUploadSEOImage(file: File, type: 'before' | 'after', order: any): Promise<string> {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Estrazione metadati per SEO
        const serviceName = order.items?.[0]?.product?.name || 'consegna-floreale';
        const city = order.cemeteryCity || 'citta';
        const province = order.deliveryProvince || 'provincia';
        const orderNum = order.orderNumber || order.id.substring(0, 8);

        // Generazione stringa SEO-friendly es. fiori-sulla-tomba-curno-bergamo-FF001-before.webp
        const seoSlug = slugify(`${serviceName}-${city}-${province}-${orderNum}`);
        const filename = `${seoSlug}-${type}.webp`;

        // Compressione hardware in Next-Gen WebP via Sharp
        const optimizedBuffer = await sharp(buffer)
            .webp({ quality: 80 })
            .toBuffer();

        // Local storage per ora (sostituibile con Vercel Blob o S3)
        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        const filepath = path.join(uploadDir, filename);
        await writeFile(filepath, optimizedBuffer);

        return `/uploads/${filename}`;
    }

    export async function submitDeliveryProof(formData: FormData) {
        try {
            const orderIdentifier = formData.get('orderIdentifier') as string;
            if (!orderIdentifier) {
                return { success: false, error: 'Codice ordine o ID mancante (es. FF-001).' };
            }

            // Ricerca Ordine per ID interno oppure identificativo WhatsApp (orderNumber)
            const order = await prisma.order.findFirst({
                where: {
                    OR: [
                        { orderNumber: orderIdentifier },
                        { id: orderIdentifier }
                    ]
                },
                include: {
                    partner: true,
                    items: {
                        include: {
                            product: true
                        }
                    }
                }
            });

            if (!order) {
                return { success: false, error: `Nessun ordine trovato con questo identificativo: ${orderIdentifier}` };
            }

            const partnerId = order.partnerId || 'partner-sistema-interno';

            // Coordinate GPS
            const latStr = formData.get('gpsLatitude') as string | null;
            const lngStr = formData.get('gpsLongitude') as string | null;
            const gpsLatitude = latStr ? parseFloat(latStr) : null;
            const gpsLongitude = lngStr ? parseFloat(lngStr) : null;

            // Recupero file
            const photoBefore = formData.get('photoBefore') as File | null;
            const photoAfter = formData.get('photoAfter') as File | null;

            let photoBeforeUrl: string | null = null;
            let photoAfterUrl: string | null = null;

            // Processing via Sharp e SEO Engine
            if (photoBefore && photoBefore.size > 0) {
                photoBeforeUrl = await processAndUploadSEOImage(photoBefore, 'before', order);
            }
            if (photoAfter && photoAfter.size > 0) {
                photoAfterUrl = await processAndUploadSEOImage(photoAfter, 'after', order);
            }

            let newStatus: 'PENDING' | 'BEFORE_UPLOADED' | 'COMPLETED' = 'PENDING';
            if (photoBeforeUrl && photoAfterUrl) {
                newStatus = 'COMPLETED';
            } else if (photoBeforeUrl || photoAfterUrl) {
                newStatus = 'BEFORE_UPLOADED';
            }

            const deliveryProof = await prisma.deliveryProof.upsert({
                where: { orderId: order.id },
                update: {
                    ...(photoBeforeUrl && { photoBeforeUrl, timestampBefore: new Date() }),
                    ...(photoAfterUrl && { photoAfterUrl, timestampAfter: new Date() }),
                    ...(gpsLatitude !== null && { gpsLatitude }),
                    ...(gpsLongitude !== null && { gpsLongitude }),
                    status: newStatus
                },
                create: {
                    orderId: order.id,
                    partnerId: partnerId,
                    photoBeforeUrl: photoBeforeUrl || null,
                    photoAfterUrl: photoAfterUrl || null,
                    timestampBefore: photoBeforeUrl ? new Date() : null,
                    timestampAfter: photoAfterUrl ? new Date() : null,
                    gpsLatitude: gpsLatitude,
                    gpsLongitude: gpsLongitude,
                    status: newStatus
                }
            });

            // Sincronizzazione status ordine principale se completo
            if (newStatus === 'COMPLETED' && order.status !== 'COMPLETED') {
                 await prisma.order.update({
                     where: { id: order.id },
                     data: { status: 'COMPLETED' }
                 });
            }

            revalidatePath('/dashboard');
            revalidatePath(`/dashboard/orders/${order.id}`);
            
            return { success: true, deliveryProof };

        } catch (error: any) {
            console.error("Double Witnessing upload error:", error);
            return { 
                success: false, 
                error: error?.message || 'Errore critico durante il salvataggio dei ricordi del Giardino della Memoria' 
            };
        }
    }
