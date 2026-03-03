import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticleBySlug, getAllArticles } from '@/lib/articles';

// ISR o SSG: Predispone la rigenerazione statica delle rotte del blog
export async function generateStaticParams() {
    const articles = await getAllArticles();
    return articles.map((article) => ({
        slug: article.slug,
    }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const resolvedParams = await params;
    const article = await getArticleBySlug(resolvedParams.slug);

    if (!article) return { title: 'Articolo non trovato' };

    return {
        title: `${article.title} | FloreMoria Blog`,
        description: article.excerpt,
    };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const resolvedParams = await params;
    const article = await getArticleBySlug(resolvedParams.slug);

    if (!article) {
        notFound();
    }

    return (
        <article className="min-h-screen bg-fm-bg pb-24">
            {/* 1) HERO IMAGE */}
            <div className="relative w-full h-[50vh] min-h-[400px]">
                <Image
                    src={article.coverImage}
                    alt={`Copertina per ${article.title}`}
                    fill
                    className="object-cover object-center"
                    priority
                />
                <div className="absolute inset-0 bg-black/40" />

                {/* Titolo Overlay */}
                <div className="absolute inset-0 flex items-end max-w-4xl mx-auto px-4 lg:px-8 pb-16 z-10">
                    <div className="space-y-4">
                        <span className="bg-fm-rose text-white text-[12px] font-bold uppercase tracking-wider px-4 py-1.5 rounded-full shadow-md">
                            {article.category}
                        </span>
                        <h1 className="text-4xl md:text-[56px] font-display font-bold text-white leading-tight drop-shadow-md">
                            {article.title}
                        </h1>
                        <time className="block text-white/90 font-medium font-body mt-4">
                            {new Date(article.date).toLocaleDateString("it-IT", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
                        </time>
                    </div>
                </div>
            </div>

            {/* 2) CORPO DEL TESTO */}
            <div className="max-w-3xl mx-auto px-4 lg:px-8 pt-16 font-body">
                {/* Tipografia Premium SEO friendly */}
                <div
                    className="prose prose-lg prose-rose lg:prose-xl max-w-none text-fm-text leading-relaxed
             prose-headings:font-display prose-headings:font-semibold prose-headings:text-fm-text prose-headings:tracking-tight
             prose-p:text-fm-text prose-p:font-normal prose-p:mb-6 prose-p:leading-8
             prose-a:text-fm-cta prose-a:underline hover:prose-a:text-fm-cta-hover
             prose-strong:text-fm-text prose-strong:font-semibold"
                    dangerouslySetInnerHTML={{ __html: article.content }}
                />
            </div>

            {/* 3) FOOTER / POTREBBE INTERESSARTI */}
            <div className="max-w-4xl mx-auto px-4 lg:px-8 pt-24 mt-16 border-t border-gray-200">
                <h3 className="text-2xl md:text-[32px] font-display font-semibold text-fm-text text-center mb-8">
                    Scegli i fiori giusti con FloreMoria
                </h3>
                <div className="bg-fm-section/50 rounded-3xl p-8 lg:p-12 text-center shadow-sm">
                    <p className="text-fm-muted text-lg mb-6 max-w-2xl mx-auto">
                        Scopri il nostro catalogo dedicato e richiedi una consegna speciale al cimitero, completa di foto conferma su WhatsApp.
                    </p>
                    <Link href="/fiori-sulle-tombe" className="inline-flex items-center justify-center px-8 py-4 bg-fm-cta text-white font-medium rounded-full hover:bg-fm-cta-hover transition-colors shadow-md">
                        Esplora i Bouquets
                    </Link>
                </div>
            </div>
        </article>
    );
}
