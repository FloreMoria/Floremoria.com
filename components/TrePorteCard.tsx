import Link from 'next/link';
import { pickRandomTrePorteHero } from '@/lib/products';
import { buildProductAlt } from '@/utils/altText';

type TrePorteCategory = 'cimitero' | 'funerale' | 'animali';

type TrePorteCardProps = {
  category: TrePorteCategory;
  href: string;
  title: string;
  description: string;
};

export default function TrePorteCard({ category, href, title, description }: TrePorteCardProps) {
  const { src, product } = pickRandomTrePorteHero(category);
  const alt = buildProductAlt(product, { context: 'card' });

  return (
    <Link
      href={href}
      className="group relative mx-auto block aspect-[3/4] w-full max-w-[420px] overflow-hidden rounded-[24px] border border-stone-200/90 bg-stone-900 shadow-sm transition-all duration-500 hover:shadow-[0_20px_50px_rgba(43,43,43,0.14)] hover:border-stone-300 lg:max-w-none"
    >
      <div className="absolute inset-0">
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-[1.03]"
          loading="lazy"
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"
        aria-hidden
      />
      <div className="relative z-10 flex h-full flex-col justify-end">
        <div className="w-full border-t border-white/20 bg-black/72 px-6 py-7 backdrop-blur-md sm:px-8 sm:py-8 lg:px-9 lg:py-9">
          <span className="mb-2 inline-block h-px w-10 bg-fm-gold" aria-hidden />
          <h3 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-[1.85rem]">
            {title}
          </h3>
          <p className="mt-2 max-w-sm font-body text-[15px] font-medium leading-relaxed text-white">
            {description}
          </p>
          <span className="mt-4 inline-flex items-center font-body text-sm font-semibold text-white underline decoration-white/60 underline-offset-4 transition group-hover:decoration-fm-gold">
            Apri il catalogo
          </span>
        </div>
      </div>
    </Link>
  );
}
