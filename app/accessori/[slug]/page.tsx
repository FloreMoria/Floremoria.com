import { products, getProductBySlug } from '@/lib/products';
import { getProductUrl } from '@/lib/productUrls';
import { getPdpCrossSellProducts } from '@/lib/getPdpCrossSellProducts';
import { notFound, permanentRedirect } from 'next/navigation';
import { Metadata } from 'next';
import ProductClientView from '@/components/ProductClientView';

interface ProductPageProps {
    params: Promise<{
        slug: string;
    }>;
    searchParams: Promise<{
        loc?: string;
    }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
    const resolvedParams = await params;
    const product = getProductBySlug(resolvedParams.slug);
    if (!product) {
        return { title: 'Accessorio non trovato' };
    }
    const nativeUrl = getProductUrl(product);
    const siteBase =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
        process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
        'https://www.floremoria.com';

    return {
        title: `${product.name} - Accessori | FloreMoria`,
        description: `Accessorio e complemento per omaggio floreale consegnato da fiorista locale con foto su WhatsApp`,
        alternates: {
            canonical: `${siteBase}${nativeUrl}`,
        },
    };
}

export async function generateStaticParams() {
    return products.map((product) => ({
        slug: product.slug,
    }));
}

export default async function AccessoryProductPage({ params, searchParams }: ProductPageProps) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const product = getProductBySlug(resolvedParams.slug);

    if (!product) {
        notFound();
    }

    const nativeUrl = getProductUrl(product);
    if (!nativeUrl.startsWith('/accessori/')) {
        const query = resolvedSearchParams.loc ? `?loc=${encodeURIComponent(resolvedSearchParams.loc)}` : '';
        permanentRedirect(`${nativeUrl}${query}`);
    }

    const relatedProducts = getPdpCrossSellProducts(product, 3);
    const initialComune = resolvedSearchParams.loc ? decodeURIComponent(resolvedSearchParams.loc).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';

    const siteBase =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
        process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
        'https://www.floremoria.com';

    const schemaOrg = {
        "@context": "https://schema.org",
        "@type": ["Product", "Offer", "LocalBusiness"],
        "name": product.name,
        "description": "Accessorio e complemento per omaggio floreale consegnato da fiorista locale con foto su WhatsApp",
        "price": product.price,
        "priceCurrency": "EUR",
        "url": `${siteBase}${nativeUrl}`
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
            />
            <ProductClientView product={product} relatedProducts={relatedProducts} initialComune={initialComune} />
        </>
    );
}
