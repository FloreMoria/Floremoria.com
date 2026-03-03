import { MetadataRoute } from 'next';
import { products } from '@/lib/products';

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.floremoria.eu';

    // 1. Pagine Istituzionali (Weekly)
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 1.0,
        },
        {
            url: `${baseUrl}/assistenza`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/chi-siamo`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/fiori-sulle-tombe`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/per-il-funerale`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/per-animali-domestici`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/enti-pubblici`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/blog`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
        }
    ];

    // 2. Pagine Dinamiche Prodotti (Daily)
    const productsSitemap: MetadataRoute.Sitemap = products.map((product) => {
        // Ipotizziamo che la route principale d'ingresso sia fiori-sulle-tombe/[slug] per la maggior parte
        // Questo andrebbe ottimizzato in base all'esatta strategia di routing adottata nel layout.
        const route = '/fiori-sulle-tombe';

        return {
            url: `${baseUrl}${route}/${product.slug}`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        };
    });

    return [...staticPages, ...productsSitemap];
}
