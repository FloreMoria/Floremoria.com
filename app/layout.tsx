import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Manrope, Great_Vibes } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import CartToaster from '@/components/CartToaster';
import Link from 'next/link';
import Image from 'next/image';
import Script from 'next/script';
import { buildGenericAlt } from '@/utils/altText';
import ConditionalLayout from '@/components/ConditionalLayout';
import FloremSocialLinks from '@/components/FloremSocialLinks';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import OpenReplayProvider from '@/components/OpenReplayProvider';
import PostmanSyncHeartbeat from '@/components/PostmanSyncHeartbeat';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

const greatVibes = Great_Vibes({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-great-vibes',
  display: 'swap',
});


function FooterLegalLink({ href, children }: { href: string; children: ReactNode }) {
    const isExternal = /^https?:\/\//i.test(href);
    const className = 'hover:text-white transition-colors';
    if (isExternal) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
                {children}
            </a>
        );
    }
    return (
        <Link href={href} className={className}>
            {children}
        </Link>
    );
}

export const metadata: Metadata = {
  title: 'FloreMoria | Consegna Fiori in Cimitero',
  description: 'Un servizio dedicato per onorare e ricordare. Consegna fiori sulle tombe, composizioni, lumini e molto altro. Affidati a FloreMoria.',
  icons: {
    icon: [
      { url: '/images/brand/Logo FloreMoria.png', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' }
    ],
    apple: '/images/brand/Logo FloreMoria.png'
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const footerBlock = (
    <footer className="bg-[#0B1220] text-white/70 py-9 sm:py-12 lg:py-18 relative z-20 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Image src="/images/footer-bg.png" alt="Campo fiorito all'alba" fill className="object-cover object-bottom opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B1220] via-[#0B1220]/90 to-transparent"></div>
      </div>
      <div className="w-full max-w-[1200px] mx-auto px-[16px] sm:px-[20px] lg:px-[32px] relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-7 sm:gap-10 lg:gap-8">
          {/* Column 1: Brand */}
          <div className="md:col-span-12 lg:col-span-5 space-y-4 sm:space-y-6">
            <Link href="/" className="inline-flex items-center gap-2.5 text-xl sm:text-2xl font-display font-bold text-white tracking-wide">
              <div className="bg-white/10 p-1.5 sm:p-2 rounded-lg">
                <Image src="/images/brand/Logo FloreMoria.png" alt={buildGenericAlt('logo')} width={60} height={57} className="h-[22px] sm:h-[28px] w-auto object-contain" />
              </div>
              FloreMoria
            </Link>
            <p className="text-[13px] sm:text-[15px] font-body leading-relaxed max-w-sm text-white/80">
              Con la bellezza dei fiori, onoriamo i ricordi di chi ci ha lasciato.
            </p>
            <FloremSocialLinks variant="footer" className="pt-2" />
          </div>

          {/* Centro footer: due colonne con separatore verticale */}
          <div className="md:col-span-12 lg:col-span-7">
            <div className="relative py-1">
              <div className="pointer-events-none absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-white/45" aria-hidden />
              <div className="space-y-2.5 sm:space-y-3">
                <div className="grid grid-cols-2 items-center gap-6">
                  <div className="pr-4 text-left font-display font-bold text-base sm:text-lg leading-tight text-white">Servizi</div>
                  <div className="pl-4 text-right font-display font-bold text-base sm:text-lg leading-tight text-white">Assistenza</div>
                </div>
                <div className="grid grid-cols-2 items-center gap-6">
                  <div className="pr-4 text-left">
                    <Link href="/fiori-sulle-tombe" className="text-[13px] sm:text-[15px] font-body hover:text-white transition-colors">Fiori sulle tombe</Link>
                  </div>
                  <div className="pl-4 text-right text-[13px] sm:text-[15px] font-body font-semibold text-white/90">Floremoria S.r.l.</div>
                </div>
                <div className="grid grid-cols-2 items-center gap-6">
                  <div className="pr-4 text-left">
                    <Link href="/per-il-funerale" className="text-[13px] sm:text-[15px] font-body hover:text-white transition-colors">Fiori per il funerale</Link>
                  </div>
                  <div className="pl-4 text-right text-[13px] sm:text-[15px] font-body text-white/70">Via Bellinzona 82/B, 22100 Como</div>
                </div>
                <div className="grid grid-cols-2 items-center gap-6">
                  <div className="pr-4 text-left">
                    <Link href="/per-animali-domestici" className="text-[13px] sm:text-[15px] font-body hover:text-white transition-colors">Piccoli Amici</Link>
                  </div>
                  <div className="pl-4 text-right text-[13px] sm:text-[15px] font-body">
                    <span className="text-white/45 uppercase text-[10px] tracking-wider mr-1">WhatsApp</span>
                    <a href="tel:+393204105305" className="text-white hover:text-fm-cta font-medium transition-colors">+39 320 410 5305</a>
                  </div>
                </div>
                <div className="grid grid-cols-2 items-center gap-6">
                  <div className="pr-4 text-left">
                    <Link href="/assistenza" className="text-[13px] sm:text-[15px] font-body hover:text-white transition-colors">Assistenza</Link>
                  </div>
                  <div className="pl-4 text-right text-[13px] sm:text-[15px] font-body">
                    <a href="mailto:assistenza@floremoria.com" className="hover:text-white transition-colors">assistenza@floremoria.com</a>
                  </div>
                </div>
                <div className="grid grid-cols-2 items-center gap-6">
                  <div className="pr-4 text-left">
                    <Link href="/login" className="text-[13px] sm:text-[15px] font-body hover:text-white transition-colors">Log In</Link>
                  </div>
                  <div className="pl-4 text-right text-[13px] sm:text-[15px] font-body">
                    <a href="mailto:floremoria@pec.it" className="hover:text-white transition-colors">floremoria@pec.it</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5 pt-5 mt-7 sm:pt-8 sm:mt-12 border-t border-white/10 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
          <Image src="/logo-made-in-italy-v2.webp" alt="Sigillo Made in Italy" width={36} height={36} className="object-contain sm:w-[45px] sm:h-[45px]" />
          <span className="text-white/20 text-xl font-light hidden md:block">|</span>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 text-[10px] sm:text-xs font-semibold tracking-widest text-white/80 uppercase">
            <span>Pagamenti Sicuri:</span>
            <Image
              src="/images/trust/stripe.svg"
              alt="Stripe"
              width={200}
              height={52}
              className="h-4 sm:h-6 w-auto max-w-[min(180px,42vw)] object-contain object-left shrink-0"
            />
            <span className="text-white/40">&bull;</span>
            <Image
              src="/images/trust/paypal.svg"
              alt="PayPal"
              width={160}
              height={42}
              className="h-4 sm:h-6 w-auto max-w-[min(150px,36vw)] object-contain object-left shrink-0"
            />
          </div>
          <span className="text-white/20 text-xl font-light hidden md:block">|</span>
          <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] sm:text-xs font-semibold tracking-widest text-white/80 uppercase">
            <span>Tutela Legale:</span>
            <Image
              src="/images/trust/iubenda.svg"
              alt="Iubenda"
              width={120}
              height={32}
              className="h-6 sm:h-7 w-auto max-w-[min(120px,38vw)] object-contain object-left shrink-0"
            />
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 pt-4 sm:pt-6 mt-4 sm:mt-6 border-t border-white/10">
          <p className="text-xs sm:text-sm font-body order-3 md:order-1 text-white/50">Copyright &copy; 2026 - FloreMoria</p>
          <div className="text-[10px] sm:text-[11px] font-body text-white/40 font-medium tracking-wide sm:tracking-widest text-center order-1 md:order-2 flex flex-col gap-1">
            <span className="uppercase">Startup innovativa iscritta al Registro Imprese</span>
            <span>P.IVA, C.F. e Iscrizione RI 04188260139 | Numero REA CO - 426383 | Capitale sociale sottoscritto: 11.410&euro; i.v.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm font-body order-2 md:order-3">
            <a
              href="https://www.iubenda.com/privacy-policy/18115980"
              className="iubenda-white iubenda-noiframe iubenda-embed iub-legal-only hover:text-white transition-colors"
              title="Privacy Policy"
            >
              Privacy Policy
            </a>
            <a
              href="https://www.iubenda.com/privacy-policy/18115980/cookie-policy"
              className="iubenda-white iubenda-noiframe iubenda-embed hover:text-white transition-colors"
              title="Cookie Policy"
            >
              Cookie Policy
            </a>
            <FooterLegalLink href="/termini-condizioni">Termini e Condizioni</FooterLegalLink>
            <FooterLegalLink href="/eliminazione-dati">Eliminazione dati</FooterLegalLink>
          </div>
        </div>
      </div>
    </footer>
  );

  return (
    <html lang="it">
      <body className={`${inter.variable} ${manrope.variable} ${greatVibes.variable} font-body bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors min-h-screen flex flex-col`}>
        <PostmanSyncHeartbeat />
        <GoogleAnalytics />
        <OpenReplayProvider />
        <ConditionalLayout footer={footerBlock}>
          {children}
        </ConditionalLayout>
        <Script src="https://cdn.iubenda.com/iubenda.js" strategy="afterInteractive" />
        <CartToaster />
      </body>
    </html>
  );
}
