import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

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
        // Ad esempio: fiori-sulle-tombe
        const baseFolder = categorySlug || 'nuova-categoria';
        
        // Assicuriamoci che non ci siano spazi nei nomi validi
        const sanitizedSlug = slug.toLowerCase().replace(/ /g, '-');
        
        const uploadDir = path.join(process.cwd(), "public", "images", "products", baseFolder, sanitizedSlug);
        
        await fs.mkdir(uploadDir, { recursive: true });

        // Estrai estensione originale
        const ext = path.extname(file.name) || (file.type.includes('webp') ? '.webp' : '.jpg');
        
        // Rinomina il file secondo lo slug
        const finalFileName = `${sanitizedSlug}${ext}`;
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
