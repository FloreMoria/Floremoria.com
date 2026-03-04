import { municipalities, Municipality } from './municipalitiesData';

export type { Municipality };

export function getAllMunicipalities(): Municipality[] {
    return municipalities;
}

export function findBySlug(slug: string): Municipality | undefined {
    const normalizedSearchSlug = slug.toLowerCase().replace(/[_\s]+/g, '-');
    return municipalities.find(m => m.slug === normalizedSearchSlug);
}
