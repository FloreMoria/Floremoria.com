import { NextResponse } from 'next/server';
import { getAllMunicipalities } from '@/lib/municipalities';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.length < 2) {
        return NextResponse.json([]);
    }

    const query = q.toLowerCase();
    const municipalities = getAllMunicipalities();

    const results = municipalities.filter(m => {
        const nameNormalized = m.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return nameNormalized.includes(query) || m.slug.includes(query);
    }).sort((a, b) => {
        const aNameNormalized = a.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const bNameNormalized = b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (aNameNormalized.startsWith(query) && !bNameNormalized.startsWith(query)) return -1;
        if (!aNameNormalized.startsWith(query) && bNameNormalized.startsWith(query)) return 1;
        return a.name.localeCompare(b.name);
    }).slice(0, 8);

    return NextResponse.json(results);
}
