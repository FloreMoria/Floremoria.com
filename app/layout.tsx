import type { Metadata } from 'next';
import { Inter, Manrope, Great_Vibes } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import CartToaster from '@/components/CartToaster';
import Link from 'next/link';
import Image from 'next/image';
import { buildGenericAlt } from '@/utils/altText';
import ConditionalLayout from '@/components/ConditionalLayout';

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
    <footer className="bg-[#0B1220] text-white/70 py-16 lg:py-24 relative z-20 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Image src="/images/footer-bg.png" alt="Campo fiorito all'alba" fill className="object-cover object-bottom opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B1220] via-[#0B1220]/90 to-transparent"></div>
      </div>
      <div className="w-full max-w-[1200px] mx-auto px-[20px] lg:px-[32px] relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-8">
          {/* Column 1: Brand */}
          <div className="md:col-span-12 lg:col-span-5 space-y-6">
            <Link href="/" className="inline-flex items-center gap-3 text-2xl font-display font-bold text-white tracking-wide">
              <div className="bg-white/10 p-2 rounded-lg">
                <Image src="/images/brand/Logo FloreMoria.png" alt={buildGenericAlt('logo')} width={60} height={57} className="h-[28px] w-auto object-contain" />
              </div>
              FloreMoria
            </Link>
            <p className="text-[15px] font-body leading-relaxed max-w-sm text-white/80">
              Con la bellezza dei fiori, onoriamo i ricordi di chi ci ha lasciato.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/20 hover:text-white transition-colors text-sm font-medium" aria-label="Instagram">Ig</a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/20 hover:text-white transition-colors text-sm font-medium" aria-label="Facebook">Fb</a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/20 hover:text-white transition-colors text-sm font-medium" aria-label="TikTok">Tk</a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/20 hover:text-white transition-colors text-sm font-medium" aria-label="YouTube">Yt</a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/20 hover:text-white transition-colors text-sm font-medium" aria-label="LinkedIn">In</a>
            </div>
          </div>

          {/* Column 2: Servizi */}
          <div className="md:col-span-6 lg:col-span-3">
            <h3 className="text-white font-display font-bold text-lg mb-6 tracking-wide">Servizi</h3>
            <ul className="space-y-3.5">
              <li><Link href="/fiori-sulle-tombe" className="text-[15px] font-body hover:text-white hover:translate-x-1 inline-block transition-all">Fiori sulle tombe</Link></li>
              <li><Link href="/per-il-funerale" className="text-[15px] font-body hover:text-white hover:translate-x-1 inline-block transition-all">Fiori per il funerale</Link></li>
              <li><Link href="/per-animali-domestici" className="text-[15px] font-body hover:text-white hover:translate-x-1 inline-block transition-all">Piccoli Amici</Link></li>
              <li><Link href="/assistenza" className="text-[15px] font-body hover:text-white hover:translate-x-1 inline-block transition-all">Assistenza</Link></li>
            </ul>
          </div>

          {/* Column 3: Assistenza */}
          <div className="md:col-span-6 lg:col-span-4 lg:pl-4">
            <h3 className="text-white font-display font-bold text-lg mb-6 tracking-wide">Assistenza</h3>
            <ul className="space-y-4 text-[15px] font-body">
              <li className="font-semibold text-white/90">Floremoria S.r.l.</li>
              <li className="text-white/70">Via Bellinzona 82/B, 22100 Como (CO)</li>
              <li className="pt-2">
                <span className="text-white/40 block text-xs uppercase tracking-wider mb-1 font-semibold">WhatsApp</span>
                <a href="tel:+393204105305" className="text-white hover:text-fm-cta text-lg font-medium transition-colors">+39 320 410 5305</a>
              </li>
              <li className="pt-2">
                <a href="mailto:assistenza@floremoria.com" className="hover:text-white transition-colors block">assistenza@floremoria.com</a>
                <a href="mailto:floremoria@pec.it" className="hover:text-white transition-colors block mt-1.5">floremoria@pec.it</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 pt-8 mt-12 border-t border-white/10 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
          <Image src="/logo-made-in-italy-v2.webp" alt="Sigillo Made in Italy" width={45} height={45} className="object-contain" />
          <span className="text-white/20 text-xl font-light hidden md:block">|</span>
          <div className="flex items-center gap-2 md:gap-3 text-xs font-semibold tracking-widest text-white/80 uppercase">
            <span>Pagamenti Sicuri:</span>
            <span className="font-bold">Stripe</span>
            <span className="text-white/40">&bull;</span>
            <span className="font-bold">PayPal</span>
          </div>
          <span className="text-white/20 text-xl font-light hidden md:block">|</span>
          <div className="text-xs font-semibold tracking-widest text-white/80 uppercase">
            Tutela Legale: <span className="font-bold ml-1">Iubenda</span>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-6 mt-6 border-t border-white/10">
          <p className="text-sm font-body order-3 md:order-1 text-white/50">Copyright &copy; 2026 - FloreMoria</p>
          <div className="text-[11px] font-body text-white/40 font-medium tracking-widest text-center order-1 md:order-2 flex flex-col gap-1">
            <span className="uppercase">Startup innovativa iscritta al Registro Imprese</span>
            <span>P.IVA, C.F. e Iscrizione RI 04188260139 | Numero REA CO - 426383 | Capitale sociale sottoscritto: 11.410&euro; i.v.</span>
          </div>
          <div className="flex items-center gap-8 text-sm font-body order-2 md:order-3">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/cookie" className="hover:text-white transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );

  return (
    <html lang="it">
      <body className={`${inter.variable} ${manrope.variable} ${greatVibes.variable} font-body bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors min-h-screen flex flex-col`}>
        <ConditionalLayout footer={footerBlock}>
          {children}
        </ConditionalLayout>
        <CartToaster />
      </body>
    </html>
  );
}
