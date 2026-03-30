import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import prisma from "@/lib/prisma"; // Adjust based on lib prisma export

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const orderId = formData.get("orderId") as string | null;
        const photo1 = formData.get("photo1") as File | null;
        const photo2 = formData.get("photo2") as File | null;
        const latitudeParam = formData.get("latitude") as string | null;
        const longitudeParam = formData.get("longitude") as string | null;

        if (!orderId || !photo1 || !photo2) {
            return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
        }

        // Parse coordinates
        let latitude = null;
        let longitude = null;
        if (latitudeParam && longitudeParam) {
            latitude = parseFloat(latitudeParam);
            longitude = parseFloat(longitudeParam);
        }

        const uploadDir = path.join(process.cwd(), "public", "images", "deliveries", orderId);
        await fs.mkdir(uploadDir, { recursive: true });

        const photoPaths: string[] = [];

        // Save Photo 1
        const buf1 = Buffer.from(await photo1.arrayBuffer());
        const ext1 = photo1.name.includes('.webp') ? '.webp' : '.jpg';
        const fp1 = path.join(uploadDir, `photo1${ext1}`);
        await fs.writeFile(fp1, buf1);
        photoPaths.push(`/images/deliveries/${orderId}/photo1${ext1}`);

        // Save Photo 2
        const buf2 = Buffer.from(await photo2.arrayBuffer());
        const ext2 = photo2.name.includes('.webp') ? '.webp' : '.jpg';
        const fp2 = path.join(uploadDir, `photo2${ext2}`);
        await fs.writeFile(fp2, buf2);
        photoPaths.push(`/images/deliveries/${orderId}/photo2${ext2}`);

        // Update Order on DB
        const dataToUpdate: any = {
            photos: photoPaths,
            status: 'COMPLETED' // Optional, perhaps the florists marks it completed by uploading
        };

        if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
            dataToUpdate.latitude = latitude;
            dataToUpdate.longitude = longitude;
        }

        // Assuming you search by 'orderNumber' or 'id'. MobileUploadClient passes orderId from URL.
        const order = await prisma.order.findFirst({
            where: {
                OR: [
                    { id: orderId },
                    { orderNumber: orderId }
                ]
            }
        });

        if (order) {
            await prisma.order.update({
                where: { id: order.id },
                data: dataToUpdate
            });
        }

        return NextResponse.json({ success: true, photoPaths, latitude, longitude });

    } catch (e) {
        console.error("Upload error:", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
