import { products, getProductBySlug } from '@/lib/products';
import { notFound } from 'next/navigation';
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
        return { title: 'Omaggio floreale non trovato' };
    }
    return {
        title: `${product.name} - Consegna fiori al cimitero | FloreMoria`,
        description: `Omaggio floreale consegnato da fiorista locale con foto su WhatsApp`,
    };
}

export async function generateStaticParams() {
    return products.map((product) => ({
        slug: product.slug,
    }));
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const product = getProductBySlug(resolvedParams.slug);

    if (!product) {
        notFound();
    }

    // Related products: 1 suggested bouquet, Lumino, Messaggio
    const suggestedBouquet = products.find(p => p.isBouquet && p.id !== product.id) || products.find(p => p.isBouquet);
    const lumino = products.find(p => p.slug === 'lumino');
    const messaggio = products.find(p => p.slug === 'messaggio');
    const relatedProducts = [suggestedBouquet, lumino, messaggio].filter(Boolean) as typeof products;

    const initialComune = resolvedSearchParams.loc ? decodeURIComponent(resolvedSearchParams.loc).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';

    const schemaOrg = {
        "@context": "https://schema.org",
        "@type": ["Product", "Offer", "LocalBusiness"],
        "name": product.name,
        "description": "Omaggio floreale consegnato da fiorista locale con foto su WhatsApp",
        "price": product.price,
        "priceCurrency": "EUR",
        "url": `https://floremoria.eu/fiori-sulle-tombe/${product.slug}`
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
