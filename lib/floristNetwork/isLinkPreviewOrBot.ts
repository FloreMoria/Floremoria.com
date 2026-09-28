/**
 * Rileva crawler / anteprime link (WhatsApp, Meta, Google, Slack, …).
 * Su /fioristi/[slug] non devono creare FloristScanEvent né cookie.
 */
export function isLinkPreviewOrBot(userAgent: string | null | undefined): boolean {
    if (!userAgent || !userAgent.trim()) {
        // UA vuoto: tipico di probe/crawler minimali → non attributiamo fee.
        return true;
    }
    const ua = userAgent.toLowerCase();
    const needles = [
        'bot',
        'spider',
        'crawl',
        'slurp',
        'facebookexternalhit',
        'facebot',
        'facebookcatalog',
        'whatsapp',
        'telegram',
        'twitterbot',
        'linkedinbot',
        'slackbot',
        'discordbot',
        'googlebot',
        'google-inspectiontool',
        'bingbot',
        'yandex',
        'baiduspider',
        'applebot',
        'petalbot',
        'semrush',
        'ahrefs',
        'duckduckbot',
        'preview',
        'embedly',
        'quora link preview',
        'pinterest',
        'redditbot',
        'vkshare',
        'w3c_validator',
        'phantomjs',
        'headlesschrome',
        'microsoft office',
        'ms-office',
        'safelinks',
        'googleimageproxy',
    ];
    return needles.some((n) => ua.includes(n));
}
