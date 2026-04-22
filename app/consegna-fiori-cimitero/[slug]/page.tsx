import { notFound, permanentRedirect } from 'next/navigation';
import { products } from '@/lib/products';
import { findBySlug } from '@/lib/municipalities';
import Link from 'next/link';
import { Metadata } from 'next';
import ProductCard from '@/components/ProductCard';
import prisma from '@/lib/prisma';
import { getDeterministicWeather, getDeterministicDistance } from '@/utils/seo-enrichment';
import Image from 'next/image';

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

    if (userSlug !== normalizedSlug) {
        permanentRedirect(`/consegna-fiori-cimitero/${normalizedSlug}`);
    }

    const comuneData = findBySlug(normalizedSlug);

    if (!comuneData) {
        notFound();
    }

    // 1. Dati Programmatici (Meteo e Distanza deterministici)
    const weatherContext = getDeterministicWeather(comuneData.name);
    const distanceContext = getDeterministicDistance(comuneData.name);

    // 2. Fetching Visual SEO Engine WebP proof from Prisma
    let deliveryProof = await prisma.deliveryProof.findFirst({
        where: {
            status: 'COMPLETED',
            order: {
                cemeteryCity: comuneData.name
            },
            photoAfterUrl: { not: null }
        },
        orderBy: { updatedAt: 'desc' }
    });

    // Fallback: cerca almeno nella stessa provincia
    if (!deliveryProof) {
        deliveryProof = await prisma.deliveryProof.findFirst({
            where: {
                status: 'COMPLETED',
                order: {
                    deliveryProvince: comuneData.province
                },
                photoAfterUrl: { not: null }
            },
            orderBy: { updatedAt: 'desc' }
        });
    }

    const finalImageUrl = deliveryProof?.photoAfterUrl || "/images/products/fiori-sulle-tombe/bouquet-omaggio-speciale/bouquet-omaggio-speciale-fiori-sulle-tombe-servizio-professionale-FT.webp";
    const isRealProof = !!deliveryProof;

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
                
                {/* SEO Programmatic Context Block */}
                <div className="mt-8 inline-block bg-white/60 backdrop-blur-md rounded-xl p-4 border border-fm-accent/20 text-left">
                    <div className="flex flex-col md:flex-row md:items-center gap-4 text-sm font-medium text-fm-text/80">
                         <div className="flex items-center gap-2">
                            <span className="text-xl">📍</span>
                            <span>Distanza media partner locale: <strong>{distanceContext}</strong></span>
                         </div>
                         <div className="hidden md:block w-px h-6 bg-fm-text/10"></div>
                         <div className="flex items-center gap-2">
                            <span className="text-xl">🌤️</span>
                            <span>Meteo attuale: <strong>{weatherContext}</strong></span>
                         </div>
                    </div>
                </div>
            </header>

            {/* Visual SEO Engine Block - DB photo or Standard Fallback */}
            <section className="max-w-4xl mx-auto px-4">
                <div className="rounded-2xl overflow-hidden bg-fm-background shadow-md border border-fm-accent/10 flex flex-col md:flex-row items-center">
                    <div className="w-full md:w-1/2 relative h-64 md:h-80">
                        <Image 
                            src={finalImageUrl} 
                            alt={`Consegna fiori a ${comuneData.name} - FloreMoria`}
                            fill
                            className="object-cover"
                        />
                    </div>
                    <div className="p-8 w-full md:w-1/2">
                        {isRealProof ? (
                            <>
                                <h3 className="text-2xl font-display font-semibold mb-3">
                                    Ultima Consegna nella Zona
                                </h3>
                                <p className="text-fm-muted font-body leading-relaxed">
                                    Questa è una fotografia autentica scattata da un fiorista in loco al termine della deposizione. 
                                    Garantiamo sempre un servizio rispettoso e discreto presso il cimitero.
                                </p>
                            </>
                        ) : (
                            <>
                                <h3 className="text-2xl font-display font-semibold mb-3">
                                    Fioristi Locali a {comuneData.name}
                                </h3>
                                <p className="text-fm-muted font-body leading-relaxed">
                                    Un esempio di composizione per onorare i propri cari. L'ordine viene preparato in tempo reale 
                                    da fioristi esperti e posato con delicatezza e decoro presso il cimitero locale. 
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </section>

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
