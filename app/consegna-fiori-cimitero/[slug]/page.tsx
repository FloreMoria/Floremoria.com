import { notFound, permanentRedirect } from 'next/navigation';
import { products } from '@/lib/products';
import { findBySlug } from '@/lib/municipalities';
import Link from 'next/link';
import { Metadata } from 'next';
import ProductCard from '@/components/ProductCard';

interface MunicipalityPageProps {
    params: Promise<{
        slug: string;
    }>;
}

export async function generateMetadata({ params }: MunicipalityPageProps): Promise<Metadata> {
    const resolvedParams = await params;
    const userSlug = resolvedParams.slug;
    const normalizedSlug = userSlug.toLowerCase().replace(/[_\s]+/g, '-');

    const comuneData = findBySlug(normalizedSlug);

    if (!comuneData) {
        return { title: 'Comune non trovato | FloreMoria' };
    }

    return {
        title: `Consegna fiori al cimitero a ${comuneData.name} | FloreMoria`,
        description: `Servizio di consegna fiori al cimitero a ${comuneData.name} (${comuneData.province}). Scopri le nostre composizioni floreali e cuscini funebri per onorare i tuoi cari.`,
    };
}

export default async function MunicipalityPage({ params }: MunicipalityPageProps) {
    const resolvedParams = await params;
    const userSlug = resolvedParams.slug;

    // Canonical slug normalization: lowercase, spaces/underscores to hyphens
    const normalizedSlug = userSlug.toLowerCase().replace(/[_\s]+/g, '-');

    // Rule B: If the incoming slug is not already fully normalized, redirect 301.
    if (userSlug !== normalizedSlug) {
        permanentRedirect(`/consegna-fiori-cimitero/${normalizedSlug}`);
    }

    const comuneData = findBySlug(normalizedSlug);

    if (!comuneData) {
        notFound();
    }

    return (
        <div className="space-y-12 lg:space-y-20">
            <header className="bg-fm-section rounded-[20px] p-8 lg:p-16 text-center text-fm-text">
                <h1 className="text-4xl md:text-[56px] font-display font-bold mb-6 leading-tight">
                    Consegna fiori al cimitero a {comuneData.name}
                </h1>
                <p className="text-xl md:text-2xl text-fm-rose font-medium tracking-tight opacity-90">
                    Servizio garantito a {comuneData.name} ({comuneData.province})
                </p>
                <p className="mt-6 max-w-2xl mx-auto text-fm-muted text-lg font-body leading-relaxed">
                    {comuneData.description} Il nostro servizio ti permette di onorare e ricordare i tuoi cari con la massima comodità e rispetto.
                </p>
            </header>

            <section className="max-w-6xl mx-auto w-full">
                <div className="flex justify-between items-end border-b border-fm-rose-soft/30 pb-4 mb-8">
                    <h2 className="text-[32px] font-display font-semibold text-fm-text leading-snug">
                        I Nostri Omaggi floreali per {comuneData.name}
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map((product) => (
                        <ProductCard
                            key={product.id}
                            product={product}
                            comuneSlug={comuneData.slug}
                            comuneName={comuneData.name}
                        />
                    ))}
                </div>
            </section>

            <div className="text-center pt-8">
                <Link
                    href="/fiori-sulle-tombe"
                    className="text-fm-text hover:text-fm-cta transition-colors duration-200 inline-flex items-center space-x-2 font-medium font-body hover:underline"
                >
                    <span>&larr;</span> <span>Torna al catalogo generale</span>
                </Link>
            </div>
        </div>
    );
}
