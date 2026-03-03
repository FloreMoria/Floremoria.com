import manifestData from '../public/images-manifest.json';

type ManifestEntry = {
    images: string[];
    coverImage: string | null;
};

type ManifestDataLegacy = Record<string, string[]>;
type ManifestDataNew = Record<string, ManifestEntry>;
type ManifestData = ManifestDataLegacy | ManifestDataNew;

const manifest = manifestData as unknown as ManifestData;

// Forces cache invalidation for the manifest
function getEntry(slug: string): ManifestEntry {
    const entry = manifest[slug];
    if (!entry) return { images: [], coverImage: null };

    // Backward compatibility for legacy arrays
    if (Array.isArray(entry)) {
        return {
            images: entry,
            coverImage: entry.length > 0 ? entry[0] : null
        };
    }

    return entry as ManifestEntry;
}

export function getImagesForProduct(slug: string): string[] {
    return getEntry(slug).images;
}

export function getCoverImageForProduct(slug: string): string | null {
    return getEntry(slug).coverImage;
}
