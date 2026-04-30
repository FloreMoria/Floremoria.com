import { Metadata } from 'next';
import BackgroundSwapper from '@/components/BackgroundSwapper';
import Link from 'next/link';
import MunicipalitySearch from '@/components/MunicipalitySearch';
import Button from '@/components/Button';
import GoogleReviewsBar from '@/components/GoogleReviewsBar';
import TextParallax from '@/components/TextParallax';
import TrustBar from '@/components/TrustBar';
import CarouselFotoConferme from '@/components/CarouselFotoConferme';
import prisma from '@/lib/prisma';
import CoreValues from '@/components/CoreValues';

export const metadata: Metadata = {
  title: 'FloreMoria | Invia fiori al cimitero in tutta Italia',
  description: 'Consegna fiori sulle tombe e nei cimiteri in Italia tramite fioristi partner. Per ogni servizio riceverai una foto di conferma per rassicurarti.',
};

export default async function Home() {
  // 0. Recupero Dati Dinamici: Ultime Prove Fotografiche
  let proofPhotos: string[] = [];
  if (prisma.deliveryProof) {
    try {
      const proofs = await prisma.deliveryProof.findMany({
        where: { status: 'COMPLETED', photoAfterUrl: { not: null } },
        orderBy: { timestampAfter: 'desc' },
        take: 3,
        select: { photoAfterUrl: true }
      });
      proofPhotos = proofs.map((p: any) => p.photoAfterUrl).filter(Boolean) as string[];
    } catch (e) {
      console.error("Prisma fetch error (Carousel):", e);
    }
  }
  
  return (
    <div className="relative">
      {/* 0) FIXED BACKGROUND HERO LAYER (SWAPPER) */}
      <BackgroundSwapper />

      {/* FOREGROUND CONTENT */}
      <div className="relative z-10 w-full pt-[72px]"> {/* pt-[72px] for navbar height */}

        {/* 1) HERO SECTION */}
        <section className="text-center flex flex-col justify-start pt-0 -mt-6 md:mt-0 md:pt-12 lg:pt-20 h-[calc(60vh-72px)] lg:h-[calc(70vh-72px)] max-w-4xl mx-auto px-4 drop-shadow-lg">
          <TextParallax speed={-0.4} className="space-y-4 md:space-y-6">
            <h1 className="text-4xl md:text-[56px] font-display font-bold text-white leading-tight tracking-tight drop-shadow-[0_2px_15px_rgba(0,0,0,0.6)]">
              FloreMoria
            </h1>
            <h2 className="text-2xl md:text-3xl text-fm-rose-soft font-semibold tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              I fiori della memoria
            </h2>
            <p className="text-lg md:text-xl text-white/95 font-medium font-body leading-relaxed max-w-2xl mx-auto bg-black/30 backdrop-blur-[2px] px-6 py-4 rounded-3xl border border-white/20 shadow-xl">
              Consegniamo bouquet di fiori freschi direttamente sulle tombe in tutta Italia e ti inviamo le due foto (prima e dopo) sul tuo WhatsApp.
            </p>
          </TextParallax>
        </section>

        {/* CONTAINER SCROLLING OVER HERO */}
        <div className="relative z-10 w-full pt-4 lg:pt-8 pb-16 space-y-16 lg:space-y-32">

          {/* TRUST BAR HORIZONTAL MARQUEE */}
          <TrustBar />

          {/* 2) SEARCH SECTION */}
          <section id="search-section" className="bg-white rounded-[30px] lg:rounded-[50px] p-8 lg:p-16 text-center max-w-4xl mx-auto shadow-[0_-15px_40px_rgba(0,0,0,0.1)] border border-fm-rose-soft/30 scroll-mt-24 mx-4 xl:mx-auto">
            <h2 className="text-[32px] font-display font-semibold text-fm-text leading-snug mb-4">
              Dove desideri inviare fiori?
            </h2>
            <p className="text-fm-muted font-body text-lg mb-8">
              Inserisci il nome del comune (Es. Como, Tivoli, Catania, ecc...)
            </p>
            <div className="max-w-md mx-auto relative z-10">
              <MunicipalitySearch />
            </div>
          </section>

          {/* 3) NEW CATEGORIES SECTION */}
          <section className="max-w-6xl mx-auto bg-white rounded-[30px] p-8 lg:p-16 shadow-xl border border-gray-100 mx-4 xl:mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-[32px] font-display font-semibold text-fm-text leading-snug">
                Scegli il servizio
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <Link href="/fiori-sulle-tombe" className="block relative overflow-hidden rounded-[30px] text-center hover:shadow-2xl transition-all duration-300 group aspect-[4/5] flex flex-col justify-end border border-fm-rose-soft/30">
                 <div className="absolute inset-0 z-0">
                    <img src={products.find(p => p.slug === 'bouquet-ricordo-affettuoso')?.coverImage || ''} alt="Fiori sulle tombe" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                 </div>
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10 transition-opacity duration-300 group-hover:opacity-90"></div>
                 <div className="relative z-20 p-8 transform transition-transform duration-300 group-hover:-translate-y-2">
                   <h3 className="text-3xl font-display font-bold text-white drop-shadow-md">Cimitero</h3>
                   <p className="text-white/90 mt-2 font-body font-medium">Consegna sulle tombe</p>
                 </div>
               </Link>

               <Link href="/per-il-funerale" className="block relative overflow-hidden rounded-[30px] text-center hover:shadow-2xl transition-all duration-300 group aspect-[4/5] flex flex-col justify-end border border-fm-rose-soft/30">
                 <div className="absolute inset-0 z-0">
                    <img src={products.find(p => p.slug === 'bouquet-omaggio-solenne')?.coverImage || ''} alt="Fiori per il Funerale" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                 </div>
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10 transition-opacity duration-300 group-hover:opacity-90"></div>
                 <div className="relative z-20 p-8 transform transition-transform duration-300 group-hover:-translate-y-2">
                   <h3 className="text-3xl font-display font-bold text-white drop-shadow-md">Funerale</h3>
                   <p className="text-white/90 mt-2 font-body font-medium">Per camera ardente e chiesa</p>
                 </div>
               </Link>

               <Link href="/per-animali-domestici" className="block relative overflow-hidden rounded-[30px] text-center hover:shadow-2xl transition-all duration-300 group aspect-[4/5] flex flex-col justify-end border border-fm-rose-soft/30">
                 <div className="absolute inset-0 z-0">
                    <img src={products.find(p => p.slug === 'anima-pura')?.coverImage || ''} alt="Fiori per i Piccoli Amici" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                 </div>
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10 transition-opacity duration-300 group-hover:opacity-90"></div>
                 <div className="relative z-20 p-8 transform transition-transform duration-300 group-hover:-translate-y-2">
                   <h3 className="text-3xl font-display font-bold text-white drop-shadow-md">Piccoli Amici</h3>
                   <p className="text-white/90 mt-2 font-body font-medium">Piante vive per ricordarli</p>
                 </div>
               </Link>
            </div>
          </section>

          {/* 4) HOW IT WORKS */}
          <section className="max-w-6xl mx-auto bg-white rounded-[30px] p-8 lg:p-16 shadow-xl border border-gray-100 mx-4 xl:mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-[32px] font-display font-semibold text-fm-text leading-snug">
                Come funziona
              </h2>
              <p className="text-fm-muted text-lg mt-4 font-body">
                Un processo semplice per esserti vicino anche da lontano.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Decorative line linking steps (hidden on mobile) */}
              <div className="hidden md:block absolute top-[40px] left-[15%] right-[15%] h-[2px] bg-fm-rose-soft/50 z-0"></div>

              {/* Step 1 */}
              <div className="flex flex-col items-center text-center space-y-4 relative z-10">
                <div className="w-20 h-20 rounded-full bg-[#E6F3EA] flex items-center justify-center text-[#2F6B43] font-display font-bold text-2xl shadow-sm border border-white">
                  1
                </div>
                <h3 className="text-xl font-display font-semibold text-fm-text mt-4">Ordina l&apos;omaggio</h3>
                <p className="text-fm-muted font-body leading-relaxed">
                  Seleziona l&apos;omaggio floreale e inserisci i dettagli del cimitero e del defunto.
                </p>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center text-center space-y-4 relative z-10">
                <div className="w-20 h-20 rounded-full bg-[#B3DABF] flex items-center justify-center text-[#1C472A] font-display font-bold text-2xl shadow-sm border border-white">
                  2
                </div>
                <h3 className="text-xl font-display font-semibold text-fm-text mt-4">Il fiorista consegna</h3>
                <p className="text-fm-muted font-body leading-relaxed">
                  Un fiorista partner locale si occuperà di preparare e recapitare i fiori con rispetto. La consegna è sempre gratuita.
                </p>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center space-y-4 relative z-10">
                <div className="w-20 h-20 rounded-full bg-[#2F6B43] flex items-center justify-center text-white font-display font-bold text-2xl shadow-md border border-white">
                  3
                </div>
                <h3 className="text-xl font-display font-semibold text-fm-text mt-4">Ricevi le foto</h3>
                <p className="text-fm-muted font-body leading-relaxed">
                  Al termine, riceverai le due foto di conferma (prima e dopo), garantendoti la massima trasparenza.
                </p>
              </div>
            </div>
          </section>

          {/* 5) TRUST / PROOF */}
          <section className="max-w-5xl mx-auto bg-[#FBF6EF] rounded-[30px] shadow-xl overflow-hidden relative mx-4 lg:mx-auto">
            <div className="relative z-10 flex flex-col md:flex-row items-stretch">
              <div className="w-full md:w-1/2 p-8 lg:p-12 flex flex-col justify-between space-y-8">
                <div className="space-y-4">
                  <h2 className="text-[32px] md:text-3xl lg:text-4xl font-display font-semibold text-fm-text leading-snug">
                    Foto di conferma per ogni consegna
                  </h2>
                  <p className="text-fm-text/80 font-body text-lg leading-relaxed">
                    Sappiamo quanto sia importante per te. Per questo, ogni nostro fiorista scatta una fotografia una volta che l&apos;omaggio floreale è stato posato. La riceverai sul tuo WhatsApp per la massima serenità.
                  </p>
                </div>
                
                <div className="pt-6 border-t border-fm-rose-soft/30 space-y-4">
                  <h3 className="text-2xl font-display font-bold text-fm-text">
                    Pronto a inviare il tuo omaggio?
                  </h3>
                  <Button href="#search-section" variant="primary" className="w-full sm:w-auto px-8 py-3.5 text-lg shadow-md justify-center">
                    Inizia ora
                  </Button>
                </div>
              </div>
              <div className="w-full md:w-1/2 bg-white/40 p-8 lg:p-12 flex items-center justify-center border-t md:border-t-0 md:border-l border-white/50">
                {/* Componente Dinamico Foto Consegne */}
                <CarouselFotoConferme photos={proofPhotos} />
              </div>
            </div>
          </section>

          {/* 6) REVIEWS SECTION */}
          <section id="reviews" className="max-w-6xl mx-auto w-full">
            <GoogleReviewsBar />
          </section>

          {/* 7) CORE VALUES / TRUST BADGES */}
          <CoreValues />

        </div>
      </div>
    </div>
  );
}

