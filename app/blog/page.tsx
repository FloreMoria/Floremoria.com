import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getAllArticles } from '@/lib/articles';

export const metadata: Metadata = {
    title: 'Il Diario di FloreMoria | Storie, pensieri e guide',
    description: 'Leggi le nostre storie e scopri i significati dietro ogni fiore.',
};

export default async function BlogArchive() {
    const articles = await getAllArticles();

    return (
        <div className="min-h-screen bg-fm-bg pt-[72px]">
            <div className="max-w-6xl mx-auto px-4 py-16 lg:py-24">

                {/* Intestazione */}
                <div className="text-center space-y-4 mb-16">
                    <h1 className="text-4xl md:text-5xl font-display font-bold text-fm-text tracking-tight">
                        Il Diario di FloreMoria
                    </h1>
                    <p className="text-lg text-fm-muted font-body max-w-2xl mx-auto">
                        Storie che scaldano l&apos;anima e consigli preziosi su come comunicare amore attraverso la natura.
                    </p>
                </div>

                {/* Griglia Glassmorphism */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {articles.map((article) => (
                        <article
                            key={article.slug}
                            className="flex flex-col bg-white/10 backdrop-blur-md border border-gray-100 rounded-3xl overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative group"
                        >
                            <Link href={`/blog/${article.slug}`} className="absolute inset-0 z-20">
                                <span className="sr-only">Leggi articolo {article.title}</span>
                            </Link>

                            <div className="relative h-64 w-full overflow-hidden bg-gray-100">
                                <Image
                                    src={article.coverImage}
                                    alt={article.title}
                                    fill
                                    className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
                                />
                                {/* Badge Categoria */}
                                <div className="absolute top-4 left-4 z-10">
                                    <span className="bg-fm-rose text-white text-[12px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-md">
                                        {article.category}
                                    </span>
                                </div>
                            </div>

                            <div className="p-8 flex flex-col flex-grow">
                                <time className="text-xs text-fm-muted font-medium mb-3">
                                    {new Date(article.date).toLocaleDateString("it-IT", {
                                        year: "numeric",
                                        month: "long",
                                        day: "numeric",
                                    })}
                                </time>
                                <h2 className="text-2xl font-display font-semibold text-fm-text leading-snug mb-4 group-hover:text-fm-rose transition-colors">
                                    {article.title}
                                </h2>
                                <p className="text-fm-text/80 font-body text-[15px] leading-relaxed mb-6 line-clamp-3">
                                    {article.excerpt}
                                </p>
                                <div className="mt-auto">
                                    <span className="inline-flex items-center text-fm-rose font-medium text-[15px] group-hover:underline">
                                        Leggi di più &rarr;
                                    </span>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>

            </div>
        </div>
    );
}
