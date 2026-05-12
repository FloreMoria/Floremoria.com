const FLOREM_SOCIAL_LINKS = [
    { href: 'https://www.instagram.com/app_floremoria/', ariaLabel: 'Instagram', abbr: 'Ig' },
    { href: 'https://www.facebook.com/FloreMoriaFioriDellaMemoria/', ariaLabel: 'Facebook', abbr: 'Fb' },
    { href: 'https://www.tiktok.com/@floremoria', ariaLabel: 'TikTok', abbr: 'Tk' },
    { href: 'https://www.youtube.com/@FloreMoria', ariaLabel: 'YouTube', abbr: 'Yt' },
    { href: 'https://www.linkedin.com/in/floremoria', ariaLabel: 'LinkedIn', abbr: 'In' },
] as const;

type FloremSocialLinksProps = {
    /** Footer scuro sito vs pagine chiare (es. Assistenza). */
    variant: 'footer' | 'onLight';
    className?: string;
};

export default function FloremSocialLinks({ variant, className = '' }: FloremSocialLinksProps) {
    const linkClass =
        variant === 'footer'
            ? 'w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/90 hover:bg-white/20 hover:text-white transition-colors text-sm font-medium'
            : 'w-10 h-10 rounded-full border border-fm-gold/25 bg-white flex items-center justify-center text-sm font-semibold text-gray-800 shadow-sm hover:bg-fm-gold/10 hover:border-fm-gold/50 transition-colors';

    return (
        <div className={`flex flex-wrap items-center gap-4 ${className}`}>
            {FLOREM_SOCIAL_LINKS.map((item) => (
                <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                    aria-label={item.ariaLabel}
                >
                    {item.abbr}
                </a>
            ))}
        </div>
    );
}
