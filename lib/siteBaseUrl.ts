/** URL pubblico del sito (immagini catalogo assolute per partner). */
export function getPublicSiteBaseUrl(): string {
    return (
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
        process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
        'https://www.floremoria.com'
    );
}
