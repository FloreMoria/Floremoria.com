'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

type ShareButtonsProps = {
    url: string;
    title: string;
    summary?: string;
};

type Channel = {
    id: string;
    label: string;
    href: string;
    className: string;
    icon: ReactNode;
};

function IconWhatsApp() {
    return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.52 3.48A11.88 11.88 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.14 1.6 5.95L.06 24l6.34-1.66a11.9 11.9 0 0 0 5.65 1.44h.01c6.55 0 11.88-5.34 11.88-11.89 0-3.17-1.24-6.14-3.42-8.41Zm-8.47 18.3h-.01a9.93 9.93 0 0 1-5.06-1.39l-.36-.21-3.76.99 1-3.67-.23-.37a9.9 9.9 0 0 1-1.52-5.28c0-5.47 4.45-9.92 9.93-9.92 2.65 0 5.14 1.04 7.01 2.91a9.86 9.86 0 0 1 2.9 7.03c0 5.47-4.45 9.92-9.9 9.92Zm5.44-7.42c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.64.08-.3-.15-1.27-.47-2.41-1.49-.89-.79-1.49-1.77-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.14-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.23 5.1 4.53.71.31 1.27.5 1.7.64.72.23 1.37.2 1.89.12.58-.09 1.77-.73 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
        </svg>
    );
}

function IconFacebook() {
    return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.02H7.9v-2.91h2.4V9.41c0-2.37 1.4-3.68 3.55-3.68 1.03 0 2.1.18 2.1.18v2.32h-1.18c-1.16 0-1.52.73-1.52 1.47v1.77h2.59l-.41 2.91h-2.18V22c4.78-.75 8.44-4.91 8.44-9.93Z" />
        </svg>
    );
}

function IconX() {
    return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.258 5.686L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
        </svg>
    );
}

function IconLinkedIn() {
    return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
    );
}

function IconTelegram() {
    return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
    );
}

function IconLink() {
    return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
    );
}

function IconShare() {
    return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
    );
}

/**
 * Barra condivisione articolo blog — Web Share nativo + fallback multi-canale resilienti.
 */
export default function ShareButtons({ url, title, summary = '' }: ShareButtonsProps) {
    const [canNativeShare, setCanNativeShare] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showChannels, setShowChannels] = useState(true);

    useEffect(() => {
        const supported =
            typeof navigator !== 'undefined' &&
            typeof navigator.share === 'function' &&
            // Preferisci native share soprattutto su device touch / mobile
            (typeof navigator.canShare !== 'function' ||
                navigator.canShare({ title, text: summary || title, url }));
        setCanNativeShare(Boolean(supported));
        // Su mobile con native share i canali restano comunque visibili come fallback
        setShowChannels(true);
    }, [title, summary, url]);

    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    const whatsappText = encodeURIComponent(`${title} ${url}`);

    const channels: Channel[] = [
        {
            id: 'whatsapp',
            label: 'WhatsApp',
            href: `https://api.whatsapp.com/send?text=${whatsappText}`,
            className: 'hover:text-[#25D366] hover:border-[#25D366]/40 hover:bg-[#25D366]/5',
            icon: <IconWhatsApp />,
        },
        {
            id: 'facebook',
            label: 'Facebook',
            href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
            className: 'hover:text-[#1877F2] hover:border-[#1877F2]/40 hover:bg-[#1877F2]/5',
            icon: <IconFacebook />,
        },
        {
            id: 'x',
            label: 'X',
            href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
            className: 'hover:text-slate-900 hover:border-slate-400 hover:bg-slate-50',
            icon: <IconX />,
        },
        {
            id: 'linkedin',
            label: 'LinkedIn',
            href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
            className: 'hover:text-[#0A66C2] hover:border-[#0A66C2]/40 hover:bg-[#0A66C2]/5',
            icon: <IconLinkedIn />,
        },
        {
            id: 'telegram',
            label: 'Telegram',
            href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
            className: 'hover:text-[#229ED9] hover:border-[#229ED9]/40 hover:bg-[#229ED9]/5',
            icon: <IconTelegram />,
        },
    ];

    const handleNativeShare = useCallback(async () => {
        try {
            await navigator.share({
                title,
                text: summary || title,
                url,
            });
        } catch {
            // Annullamento utente o fallimento browser: non bloccare, mostra canali
            setShowChannels(true);
        }
    }, [title, summary, url]);

    const handleCopyLink = useCallback(async () => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                const ta = document.createElement('textarea');
                ta.value = url;
                ta.setAttribute('readonly', '');
                ta.style.position = 'absolute';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2500);
        } catch {
            // Isolato: fallimento clipboard non interrompe altri canali
            setCopied(false);
        }
    }, [url]);

    const openChannel = useCallback((href: string) => {
        try {
            const win = window.open(href, '_blank', 'noopener,noreferrer');
            if (!win) {
                // Popup bloccato: fallback stessa tab non forzato — utente può ritentare o usare altro canale
                const a = document.createElement('a');
                a.href = href;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.click();
            }
        } catch {
            // Isolato per canale
        }
    }, []);

    const btnBase =
        'inline-flex items-center justify-center min-h-11 min-w-11 h-11 w-11 rounded-full border border-stone-200/90 bg-white text-slate-600 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-fm-gold/40 focus:ring-offset-1';

    return (
        <nav
            aria-label="Condividi articolo"
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-4 border-y border-stone-200/80"
        >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 font-body">
                Condividi
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
                {canNativeShare ? (
                    <button
                        type="button"
                        onClick={() => void handleNativeShare()}
                        className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-full bg-fm-gold text-white text-sm font-medium shadow-sm hover:bg-yellow-600 transition-colors focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:ring-offset-1"
                    >
                        <IconShare />
                        Condividi articolo
                    </button>
                ) : null}

                {showChannels
                    ? channels.map((ch) => (
                          <a
                              key={ch.id}
                              href={ch.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Condividi su ${ch.label}`}
                              title={ch.label}
                              className={`${btnBase} ${ch.className}`}
                              onClick={(e) => {
                                  // Isola: se open fallisce, non bloccare navigazione href nativa
                                  e.preventDefault();
                                  openChannel(ch.href);
                              }}
                          >
                              {ch.icon}
                          </a>
                      ))
                    : null}

                <button
                    type="button"
                    onClick={() => void handleCopyLink()}
                    aria-label="Copia link"
                    title={copied ? 'Link copiato!' : 'Copia link'}
                    className={`${btnBase} hover:text-fm-gold hover:border-fm-gold/50 hover:bg-fm-gold/5 ${
                        copied ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : ''
                    }`}
                >
                    <IconLink />
                </button>

                {copied ? (
                    <span className="text-xs font-medium text-emerald-700 font-body" role="status">
                        Link copiato!
                    </span>
                ) : null}
            </div>
        </nav>
    );
}
