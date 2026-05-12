'use client';

export default function FloatingWhatsAppButton() {
    const phone = '393204105305';
    const message = encodeURIComponent('Ciao FloreMoria, avrei bisogno di assistenza.');
    const href = `https://wa.me/${phone}?text=${message}`;

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contatta assistenza su WhatsApp"
            className="fixed right-1 top-20 sm:right-6 sm:top-24 z-[9999] inline-flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_10px_24px_rgba(37,211,102,0.35)] transition-transform duration-200 hover:scale-105 hover:shadow-[0_14px_28px_rgba(37,211,102,0.42)] focus:outline-none focus:ring-2 focus:ring-[#25D366]/60 focus:ring-offset-2"
        >
            <svg className="h-6 w-6 sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.52 3.48A11.88 11.88 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.14 1.6 5.95L.06 24l6.34-1.66a11.9 11.9 0 0 0 5.65 1.44h.01c6.55 0 11.88-5.34 11.88-11.89 0-3.17-1.24-6.14-3.42-8.41Zm-8.47 18.3h-.01a9.93 9.93 0 0 1-5.06-1.39l-.36-.21-3.76.99 1-3.67-.23-.37a9.9 9.9 0 0 1-1.52-5.28c0-5.47 4.45-9.92 9.93-9.92 2.65 0 5.14 1.04 7.01 2.91a9.86 9.86 0 0 1 2.9 7.03c0 5.47-4.45 9.92-9.9 9.92Zm5.44-7.42c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.64.08-.3-.15-1.27-.47-2.41-1.49-.89-.79-1.49-1.77-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.14-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.23 5.1 4.53.71.31 1.27.5 1.7.64.72.23 1.37.2 1.89.12.58-.09 1.77-.73 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
            </svg>
        </a>
    );
}
