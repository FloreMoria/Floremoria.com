export function getLocalDateKey() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Mulberry32 PRNG
export function mulberry32(a: number) {
    return function () {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// Simple string hash
export function xmur3(str: string) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    }
    return function () {
        h = Math.imul(h ^ h >>> 16, 2246822507);
        h = Math.imul(h ^ h >>> 13, 3266489909);
        return (h ^= h >>> 16) >>> 0;
    }
}

export function seededShuffle<T>(array: T[], seedString: string): T[] {
    const seed = xmur3(seedString)();
    const rand = mulberry32(seed);
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export interface DailyImageSet {
    date: string;
    cardImage: string | null;
    gallery: string[];
    main: string | null;
}

export function getDailyImageSet(productId: string, images?: string[]): DailyImageSet {
    // Se le immagini non ci sono, ritorniamo null / vuoto
    if (!images || images.length === 0) {
        return {
            date: getLocalDateKey(),
            cardImage: null,
            gallery: [],
            main: null
        };
    }

    const todayKey = getLocalDateKey();
    const cacheKey = `fm_daily_images_v4_${productId}`;

    const computeFresh = (): DailyImageSet => {
        const shuffled = seededShuffle(images, todayKey + productId);

        // Se abbiamo una sola immagine, riempiamo l'array usando sempre quella
        let finalGallery = shuffled;
        if (shuffled.length < 5) {
            finalGallery = [];
            for (let i = 0; i < 5; i++) {
                finalGallery.push(shuffled[i % shuffled.length]);
            }
        } else {
            finalGallery = shuffled.slice(0, 5);
        }

        return {
            date: todayKey,
            cardImage: shuffled[0],
            gallery: finalGallery,
            main: shuffled[0]
        };
    };

    if (typeof window === 'undefined') {
        return computeFresh();
    }

    try {
        const storedStr = localStorage.getItem(cacheKey);
        if (storedStr) {
            const stored = JSON.parse(storedStr) as DailyImageSet;

            // Check if the stored images actually exist in the currently provided images array
            // This prevents returning 404 cached paths if the server folders changed
            const isCacheValid = stored.date === todayKey &&
                stored.gallery.length >= 5 &&
                stored.gallery.every(img => images.includes(img));

            if (isCacheValid) {
                return stored;
            }
        }
    } catch (e) {
        // Ignora errori di parsing del JSON corrotto
    }

    const fresh = computeFresh();

    try {
        localStorage.setItem(cacheKey, JSON.stringify(fresh));
    } catch (e) {
        // Ignora errori di quota o privacy setting (es block in Incognito)
    }

    return fresh;
}
