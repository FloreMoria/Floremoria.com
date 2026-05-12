import TrePorteCard from '@/components/TrePorteCard';

type TrePorteSectionProps = {
    /** Slug comune (es. da pagina consegna-fiori-cimitero): aggiunge `?loc=` ai link delle tre categorie. */
    comuneSlug?: string;
    /** Se valorizzato, adatta il sottotitolo alla pagina comune. */
    comuneName?: string;
    className?: string;
    sectionId?: string;
};

export default function TrePorteSection({
    comuneSlug,
    comuneName,
    className = '',
    sectionId = 'tre-porte',
}: TrePorteSectionProps) {
    const q = comuneSlug ? `?loc=${encodeURIComponent(comuneSlug)}` : '';

    const place = comuneName?.trim() ?? '';
    const intro =
        place.length > 0
            ? `A ${place}: tombe, funerale o un ultimo gesto per un animale amato — tre contesti, con la cura silenziosa: fiori freschi, fioristi sul territorio e la conferma su WhatsApp.`
            : 'Tombe, funerale o un ultimo gesto per un animale amato: tre contesti, con la cura silenziosa — fiori freschi, fioristi sul territorio e la conferma su WhatsApp.';

    return (
        <section
            id={sectionId}
            aria-labelledby={`${sectionId}-heading`}
            className={`max-w-7xl mx-auto scroll-mt-24 bg-[#FAF9F6] rounded-[24px] p-5 sm:p-10 lg:p-14 shadow-[0_8px_48px_rgba(43,43,43,0.05)] border border-stone-200/70 mx-4 xl:mx-auto ${className}`}
        >
            <header className="text-center mb-6 sm:mb-10 lg:mb-14 max-w-2xl mx-auto space-y-3 sm:space-y-4">
                <p className="text-[11px] sm:text-xs font-body uppercase tracking-[0.22em] text-fm-muted">
                    Dove conta il tuo ricordo
                </p>
                <h2
                    id={`${sectionId}-heading`}
                    className="text-[24px] sm:text-[34px] lg:text-[40px] font-display font-semibold text-fm-text leading-tight tracking-tight"
                >
                    Tre modi per accompagnarti
                </h2>
                <p className="text-fm-muted font-body text-[15px] sm:text-lg leading-relaxed">{intro}</p>
            </header>
            <div className="grid grid-cols-1 gap-4 sm:gap-5 md:hidden">
                <TrePorteCard
                    category="cimitero"
                    href={`/fiori-sulle-tombe${q}`}
                    eyebrow="Tombe"
                    title="Fiori sulle tombe"
                    description="Consegna sulle tombe con fioristi locali verificati. Ricevi conferma rapida su WhatsApp."
                    compactMobile
                />
                <TrePorteCard
                    category="funerale"
                    href={`/per-il-funerale${q}`}
                    eyebrow="Funerale"
                    title="Fiori per il Funerale"
                    description="Per camera ardente, chiesa e luoghi del commiato. Servizio discreto, puntuale, rispettoso."
                    compactMobile
                />
                <TrePorteCard
                    category="animali"
                    href={`/per-animali-domestici${q}`}
                    eyebrow="Piccoli Amici"
                    title="Fiori per i Piccoli Amici"
                    description="Un ultimo omaggio per gli animali di famiglia: composizioni delicate e sobrie."
                    compactMobile
                />
            </div>
            <div className="hidden md:grid md:grid-cols-3 md:gap-7 lg:gap-8">
                <TrePorteCard
                    category="cimitero"
                    href={`/fiori-sulle-tombe${q}`}
                    eyebrow="Tombe"
                    title="Fiori sulle tombe"
                    description="Consegna sulle tombe, con rete di fioristi locali in tutta Italia."
                />
                <TrePorteCard
                    category="funerale"
                    href={`/per-il-funerale${q}`}
                    eyebrow="Funerale"
                    title="Fiori per il Funerale"
                    description="Camera ardente, chiesa e luoghi del commiato — con la stessa discrezione."
                />
                <TrePorteCard
                    category="animali"
                    href={`/per-animali-domestici${q}`}
                    eyebrow="Piccoli Amici"
                    title="Fiori per i Piccoli Amici"
                    description="Omaggi dedicati agli animali di famiglia: piante e composizioni con cuore."
                />
            </div>
        </section>
    );
}
