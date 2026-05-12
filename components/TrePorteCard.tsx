import Link from 'next/link';
import Image from 'next/image';
import { pickRandomTrePorteHero } from '@/lib/products';
import { buildProductAlt } from '@/utils/altText';

type TrePorteCategory = 'cimitero' | 'funerale' | 'animali';

type TrePorteCardProps = {
  category: TrePorteCategory;
  href: string;
  title: string;
  description: string;
  /** Etichetta breve per le tre categorie (Tombe / Funerale / Piccoli Amici). */
  eyebrow: string;
  compactMobile?: boolean;
};

export default function TrePorteCard({
  category,
  href,
  title,
  description,
  eyebrow,
  compactMobile = false,
}: TrePorteCardProps) {
  const { src, product } = pickRandomTrePorteHero(category);
  const alt = buildProductAlt(product, { context: 'card' });

  return (
    <Link
      href={href}
      className={`group mx-auto flex h-full min-h-0 w-full max-w-[420px] flex-col overflow-hidden rounded-[22px] border border-stone-200/80 bg-[#FAF9F6] shadow-[0_6px_28px_rgba(43,43,43,0.05)] transition-all duration-500 hover:border-stone-300/90 hover:shadow-[0_18px_48px_rgba(43,43,43,0.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fm-gold/70 lg:max-w-none ${
        compactMobile ? 'max-w-none' : ''
      }`}
    >
      <div className={`relative w-full shrink-0 overflow-hidden bg-stone-200/60 ${compactMobile ? 'aspect-[16/10] md:aspect-[3/4]' : 'aspect-[3/4]'}`}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 33vw"
          className="object-cover transition-transform duration-[1.1s] ease-out group-hover:scale-[1.025]"
          loading="lazy"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-stone-900/25 via-transparent to-transparent"
          aria-hidden
        />
      </div>

      <div className={`flex flex-1 flex-col ${compactMobile ? 'px-5 py-5 sm:px-6 sm:py-6 md:px-7 md:py-8 lg:px-8 lg:py-9' : 'px-6 py-7 sm:px-7 sm:py-8 lg:px-8 lg:py-9'}`}>
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-fm-muted">{eyebrow}</p>
        <span className="mt-3 inline-block h-px w-9 bg-fm-gold/80" aria-hidden />
        <h3 className={`mt-4 font-display font-semibold tracking-tight text-fm-text ${compactMobile ? 'text-[22px] leading-tight sm:text-2xl lg:text-[1.35rem] lg:leading-snug' : 'text-xl sm:text-2xl lg:text-[1.35rem] lg:leading-snug'}`}>
          {title}
        </h3>
        <p className={`mt-3 flex-1 font-body text-[15px] leading-relaxed text-fm-muted ${compactMobile ? 'line-clamp-2 md:line-clamp-none' : ''}`}>{description}</p>
        <span className={`inline-flex items-center gap-2 font-body text-sm font-semibold text-fm-text ${compactMobile ? 'mt-4' : 'mt-6'}`}>
          <span className="border-b border-fm-gold/50 pb-px transition group-hover:border-fm-gold">Apri il catalogo</span>
          <span className="text-fm-gold transition group-hover:translate-x-0.5" aria-hidden>
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
