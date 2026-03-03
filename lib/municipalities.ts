import fs from 'fs';
import path from 'path';

export interface Municipality {
    name: string;
    province: string;
    slug: string;
    description?: string;
}

let cachedMunicipalities: Municipality[] | null = null;

function generateSlug(name: string, province: string): string {
    const cleanName = name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/'/g, "") // replace apostrophes with nothing
        .replace(/[^a-z0-9]/g, "-") // replace non-alphanumerics with single hyphens
        .replace(/-+/g, "-") // collapse multiple hyphens
        .replace(/^-|-$/g, ""); // trim hyphens

    const cleanProvince = province.toLowerCase().trim();
    return `${cleanName}-${cleanProvince}`;
}

export function getAllMunicipalities(): Municipality[] {
    if (cachedMunicipalities) {
        return cachedMunicipalities;
    }

    const csvPath = path.join(process.cwd(), 'data', 'municipalities.csv');

    if (!fs.existsSync(csvPath)) {
        console.warn("municipalities.csv not found.");
        return [];
    }

    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split(/\r?\n/);

    const results: Municipality[] = [];
    const seenSlugs = new Set<string>();
    let duplicateCount = 0;

    for (const line of lines) {
        if (!line.trim()) continue;

        const delimiter = line.includes(';') ? ';' : ',';
        const parts = line.split(delimiter);

        if (parts.length >= 2) {
            const name = parts[0].trim();
            const province = parts[1].trim().toUpperCase();

            if (!name || !province) continue;

            const slug = generateSlug(name, province);

            if (seenSlugs.has(slug)) {
                duplicateCount++;
                continue;
            }

            seenSlugs.add(slug);

            results.push({
                name,
                province,
                slug,
                description: `Servizio di consegna fiori al cimitero a ${name} (${province}).`
            });
        }
    }

    if (duplicateCount > 0) {
        console.log(`Loaded municipalities but skipped ${duplicateCount} duplicates found in CSV.`);
    }

    cachedMunicipalities = results;
    return results;
}

export function findBySlug(slug: string): Municipality | undefined {
    const municipalities = getAllMunicipalities();
    const normalizedSearchSlug = slug.toLowerCase().replace(/[_\s]+/g, '-');
    return municipalities.find(m => m.slug === normalizedSearchSlug);
}
