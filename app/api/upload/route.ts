import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { putBlobWithAccessFallback } from "@/lib/blob/storeAccess";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const slug = formData.get("slug") as string | null;
        const categorySlug = formData.get("categorySlug") as string | null;

        if (!file || !slug) {
            return NextResponse.json({ error: "File e slug sono richiesti" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        
        // Determina la cartella base. Useremo il category slug se fornito, altrimenti una di default.
        const baseFolder = categorySlug || 'nuova-categoria';
        
        // Assicuriamoci che non ci siano spazi nei nomi validi
        const sanitizedSlug = slug.toLowerCase().replace(/ /g, '-');
        
        // Estrai estensione originale
        const ext = path.extname(file.name) || (file.type.includes('webp') ? '.webp' : '.jpg');
        const finalFileName = `${sanitizedSlug}${ext}`;

        // 1. Se configurato Vercel Blob (Produzione su Vercel), carichiamo lì
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
                const blobPath = `floremoria-media/products/${baseFolder}/${sanitizedSlug}/${finalFileName}`;
                const blobResult = await putBlobWithAccessFallback(blobPath, buffer, {
                    contentType: file.type || 'image/jpeg',
                    token: process.env.BLOB_READ_WRITE_TOKEN,
                    addRandomSuffix: true // Aggiungiamo un suffisso per evitare caching aggressivo sui browser
                });
                return NextResponse.json({ success: true, url: blobResult.url });
            } catch (blobErr) {
                console.error("[upload-api] Errore caricamento Vercel Blob:", blobErr);
                // Continua come fallback sul filesystem locale se fallisce
            }
        }

        // 2. Fallback su file system locale (solo per sviluppo locale)
        const uploadDir = path.join(process.cwd(), "public", "images", "products", baseFolder, sanitizedSlug);
        await fs.mkdir(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, finalFileName);

        await fs.writeFile(filePath, buffer);

        // Path da salvare nel database
        const publicUrl = `/images/products/${baseFolder}/${sanitizedSlug}/${finalFileName}`;

        return NextResponse.json({ success: true, url: publicUrl });

    } catch (e) {
        console.error("Upload error:", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
