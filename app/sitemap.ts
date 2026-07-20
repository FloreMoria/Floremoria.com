import { MetadataRoute } from 'next';
import { products } from '@/lib/products';
import { getProductUrl } from '@/lib/productUrls';

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.floremoria.com';

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
        },
        {
            url: `${baseUrl}/termini-condizioni`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.6,
        },
        {
            url: `${baseUrl}/eliminazione-dati`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.5,
        }
    ];

    // 2. Pagine Dinamiche Prodotti (Daily)
    const productsSitemap: MetadataRoute.Sitemap = products.map((product) => {
        return {
            url: `${baseUrl}${getProductUrl(product)}`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        };
    });

    return [...staticPages, ...productsSitemap];
}
