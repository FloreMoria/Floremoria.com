import { Metadata } from 'next';
import { getProductBySlug } from '@/lib/products';
import { buildProductAlt } from '@/utils/altText';
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
  const trePorteTombe = getProductBySlug('bouquet-ricordo-affettuoso');
  const trePorteFunerale = getProductBySlug('bouquet-omaggio-solenne');
  const trePortePiccoli = getProductBySlug('anima-pura');

  // Recupero ultime prove fotografiche (carousel)
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

        {/* Ordine sezioni: Ricerca → Tre porte → Come funziona → Foto → Recensioni → Valori → TrustBar */}
        <div className="relative z-10 w-full pt-4 lg:pt-8 pb-16 space-y-16 lg:space-y-28">

          {/* 2) Ricerca */}
          <section id="search-section" className="bg-[#FDFCF9] rounded-[28px] lg:rounded-[40px] p-8 lg:p-16 text-center max-w-4xl mx-auto shadow-[0_8px_40px_rgba(43,43,43,0.06)] border border-stone-200/80 scroll-mt-24 mx-4 xl:mx-auto">
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

          {/* 3) Tre porte — categorie (sostituisce il blocco “Scegli il servizio” / galleria omaggi) */}
          <section
            id="tre-porte"
            aria-labelledby="tre-porte-heading"
            className="max-w-7xl mx-auto bg-[#FAF9F6] rounded-[28px] p-6 sm:p-10 lg:p-14 shadow-[0_8px_48px_rgba(43,43,43,0.05)] border border-stone-200/70 mx-4 xl:mx-auto"
          >
            <header className="text-center mb-10 lg:mb-14 max-w-2xl mx-auto space-y-3">
              <p className="text-[11px] sm:text-xs font-body uppercase tracking-[0.28em] text-fm-muted">
                Percorsi
              </p>
              <h2 id="tre-porte-heading" className="text-[28px] sm:text-[34px] lg:text-[40px] font-display font-semibold text-fm-text leading-tight tracking-tight">
                Tre porte
              </h2>
              <p className="text-fm-muted font-body text-base sm:text-lg leading-relaxed">
                Tre ingressi distinti: stesso rigore, stessa cura. Scegli il contesto che rispecchia il tuo ricordo.
              </p>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8">
              <Link
                href="/fiori-sulle-tombe"
                className="group relative flex min-h-[320px] sm:min-h-[380px] lg:min-h-[420px] flex-col justify-end overflow-hidden rounded-[24px] border border-stone-200/90 bg-stone-100 shadow-sm transition-all duration-500 hover:shadow-[0_20px_50px_rgba(43,43,43,0.12)] hover:border-stone-300"
              >
                <div className="absolute inset-0">
                  <img
                    src={trePorteTombe?.coverImage || ''}
                    alt={trePorteTombe ? buildProductAlt(trePorteTombe, { context: 'card' }) : 'Fiori sulle tombe, catalogo FloreMoria'}
                    className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/75 via-stone-900/25 to-transparent" aria-hidden />
                <div className="relative z-10 p-7 sm:p-9 lg:p-10">
                  <span className="mb-3 inline-block h-px w-12 bg-fm-gold/90" aria-hidden />
                  <h3 className="font-display text-2xl sm:text-3xl lg:text-[1.85rem] font-semibold tracking-tight text-white">
                    Fiori sulle tombe
                  </h3>
                  <p className="mt-2 max-w-sm font-body text-[15px] leading-relaxed text-white/85">
                    Consegna sulle tombe, con rete di fioristi locali in tutta Italia.
                  </p>
                  <span className="mt-5 inline-flex items-center font-body text-sm font-medium text-white/95 underline decoration-white/40 underline-offset-4 transition group-hover:decoration-fm-gold">
                    Apri il catalogo
                  </span>
                </div>
              </Link>

              <Link
                href="/per-il-funerale"
                className="group relative flex min-h-[320px] sm:min-h-[380px] lg:min-h-[420px] flex-col justify-end overflow-hidden rounded-[24px] border border-stone-200/90 bg-stone-100 shadow-sm transition-all duration-500 hover:shadow-[0_20px_50px_rgba(43,43,43,0.12)] hover:border-stone-300"
              >
                <div className="absolute inset-0">
                  <img
                    src={trePorteFunerale?.coverImage || ''}
                    alt={trePorteFunerale ? buildProductAlt(trePorteFunerale, { context: 'card' }) : 'Fiori per il Funerale, catalogo FloreMoria'}
                    className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/75 via-stone-900/25 to-transparent" aria-hidden />
                <div className="relative z-10 p-7 sm:p-9 lg:p-10">
                  <span className="mb-3 inline-block h-px w-12 bg-fm-gold/90" aria-hidden />
                  <h3 className="font-display text-2xl sm:text-3xl lg:text-[1.85rem] font-semibold tracking-tight text-white">
                    Fiori per il Funerale
                  </h3>
                  <p className="mt-2 max-w-sm font-body text-[15px] leading-relaxed text-white/85">
                    Camera ardente, chiesa e luoghi del commiato — con la stessa discrezione.
                  </p>
                  <span className="mt-5 inline-flex items-center font-body text-sm font-medium text-white/95 underline decoration-white/40 underline-offset-4 transition group-hover:decoration-fm-gold">
                    Apri il catalogo
                  </span>
                </div>
              </Link>

              <Link
                href="/per-animali-domestici"
                className="group relative flex min-h-[320px] sm:min-h-[380px] lg:min-h-[420px] flex-col justify-end overflow-hidden rounded-[24px] border border-stone-200/90 bg-stone-100 shadow-sm transition-all duration-500 hover:shadow-[0_20px_50px_rgba(43,43,43,0.12)] hover:border-stone-300"
              >
                <div className="absolute inset-0">
                  <img
                    src={trePortePiccoli?.coverImage || ''}
                    alt={trePortePiccoli ? buildProductAlt(trePortePiccoli, { context: 'card' }) : 'Fiori per i Piccoli Amici, catalogo FloreMoria'}
                    className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/75 via-stone-900/25 to-transparent" aria-hidden />
                <div className="relative z-10 p-7 sm:p-9 lg:p-10">
                  <span className="mb-3 inline-block h-px w-12 bg-fm-gold/90" aria-hidden />
                  <h3 className="font-display text-2xl sm:text-3xl lg:text-[1.85rem] font-semibold tracking-tight text-white">
                    Fiori per i Piccoli Amici
                  </h3>
                  <p className="mt-2 max-w-sm font-body text-[15px] leading-relaxed text-white/85">
                    Omaggi dedicati agli animali di famiglia: piante e composizioni con cuore.
                  </p>
                  <span className="mt-5 inline-flex items-center font-body text-sm font-medium text-white/95 underline decoration-white/40 underline-offset-4 transition group-hover:decoration-fm-gold">
                    Apri il catalogo
                  </span>
                </div>
              </Link>
            </div>
          </section>

          {/* 4) Come funziona */}
          <section className="max-w-6xl mx-auto bg-[#FDFCF9] rounded-[28px] p-8 lg:p-16 shadow-[0_8px_40px_rgba(43,43,43,0.05)] border border-stone-200/80 mx-4 xl:mx-auto">
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

          {/* 5) Foto di conferma */}
          <section className="max-w-5xl mx-auto overflow-hidden rounded-[28px] border border-stone-200/80 bg-[#F7F5F0] shadow-[0_8px_40px_rgba(43,43,43,0.06)] relative mx-4 lg:mx-auto">
            <div className="relative z-10 flex flex-col md:flex-row items-stretch">
              <div className="w-full md:w-1/2 p-8 lg:p-12 flex flex-col justify-between space-y-8">
                <div className="space-y-5">
                  <h2 className="text-[32px] md:text-3xl lg:text-4xl font-display font-semibold text-fm-text leading-snug">
                    Foto di conferma per ogni consegna
                  </h2>
                  <p className="rounded-2xl border border-fm-gold/25 bg-fm-gold-soft/80 px-4 py-3 font-display text-[15px] font-semibold tracking-wide text-fm-text sm:text-base">
                    Lo scatto fotografico dopo la consegna — la foto con l&apos;omaggio già posato — è{' '}
                    <span className="whitespace-nowrap text-fm-gold">sempre gratuito</span>.
                  </p>
                  <p className="text-fm-text/80 font-body text-lg leading-relaxed">
                    Sappiamo quanto conti avere una prova tangibile. Il fiorista documenta il lavoro svolto; ricevi tutto sul tuo WhatsApp, con la stessa cura che mettiamo in ogni dettaglio del servizio.
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
              <div className="w-full md:w-1/2 bg-[#FDFCF9]/90 p-8 lg:p-12 flex items-center justify-center border-t border-stone-200/60 md:border-t-0 md:border-l md:border-stone-200/60">
                {/* Componente Dinamico Foto Consegne */}
                <CarouselFotoConferme photos={proofPhotos} />
              </div>
            </div>
          </section>

          {/* 6) Recensioni */}
          <section id="reviews" className="max-w-6xl mx-auto w-full px-4">
            <GoogleReviewsBar />
          </section>

          {/* 7) Valori */}
          <CoreValues />

          <TrustBar />
        </div>
      </div>
    </div>
  );
}

