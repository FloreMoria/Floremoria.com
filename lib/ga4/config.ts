/** ID misurazione tag gtag (es. G-GVL7FSLBDK) — pubblico, solo sito. */
export const GA4_MEASUREMENT_ID =
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || 'G-GVL7FSLBDK';

/** ID numerico proprietà GA4 per Data API (Admin → Impostazioni proprietà). */
export function getGa4PropertyId(): string | undefined {
    const id = process.env.GA4_PROPERTY_ID?.trim();
    return id || undefined;
}

/** Stesso ID proprietà, esposto al client solo per link alla console GA4. */
export function getGa4PropertyIdPublic(): string | undefined {
    const id =
        process.env.NEXT_PUBLIC_GA4_PROPERTY_ID?.trim() ||
        process.env.GA4_PROPERTY_ID?.trim();
    return id || undefined;
}

export type Ga4ConsoleView = 'reports' | 'realtime';

export function buildGa4ConsoleUrl(
    view: Ga4ConsoleView = 'reports',
    propertyId?: string,
): string {
    const pid = propertyId ?? getGa4PropertyIdPublic();
    if (!pid) {
        return 'https://analytics.google.com/';
    }
    const path =
        view === 'realtime' ? 'realtime/overview' : 'reports/intelligenthome';
    return `https://analytics.google.com/analytics/web/#/p${pid}/${path}`;
}
