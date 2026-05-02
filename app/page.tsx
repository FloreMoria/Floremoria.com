import { Metadata } from 'next';
import TrePorteCard from '@/components/TrePorteCard';
import BackgroundSwapper from '@/components/BackgroundSwapper';
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

async function loadDeliveryProofPhotos(): Promise<string[]> {
  if (!process.env.DATABASE_URL?.trim()) {
    return [];
  }
  try {
    const proofs = await prisma.deliveryProof.findMany({
      where: { status: 'COMPLETED', photoAfterUrl: { not: null } },
      orderBy: { timestampAfter: 'desc' },
      take: 3,
      select: { photoAfterUrl: true },
    });
    return proofs
      .map((p) => p.photoAfterUrl)
      .filter((url): url is string => typeof url === 'string' && url.trim() !== '');
  } catch {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[FloreMoria] Home: DB non raggiungibile o non configurato — carousel foto usa i fallback. Avvia Postgres o aggiorna DATABASE_URL in .env.local.'
      );
    }
    return [];
  }
}

export default async function Home() {
  const proofPhotos = await loadDeliveryProofPhotos();
  
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

        {/* Banner fiducia: in basso verso la ricerca (NINA: respiro visivo prima di “Dove desideri…”) */}
        <div className="relative z-10 w-full mt-6 md:mt-10 lg:mt-14 mb-1 lg:mb-2">
          <TrustBar compactBottom />
        </div>

        {/* Ordine sezioni: Ricerca → Tre porte → Come funziona → Foto → Recensioni → Valori */}
        <div className="relative z-10 w-full pt-3 lg:pt-5 pb-16 space-y-16 lg:space-y-28">

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
            <header className="text-center mb-10 lg:mb-14 max-w-2xl mx-auto space-y-4">
              <p className="text-[11px] sm:text-xs font-body uppercase tracking-[0.22em] text-fm-muted">
                Dove conta il tuo ricordo
              </p>
              <h2 id="tre-porte-heading" className="text-[28px] sm:text-[34px] lg:text-[40px] font-display font-semibold text-fm-text leading-tight tracking-tight">
                Tre modi per accompagnarti
              </h2>
              <p className="text-fm-muted font-body text-base sm:text-lg leading-relaxed">
                Tombe, funerale o un ultimo gesto per un animale amato: tre contesti diversi, con la stessa cura silenziosa — fiori freschi, fioristi sul territorio e la conferma su WhatsApp.
              </p>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8">
              <TrePorteCard
                category="cimitero"
                href="/fiori-sulle-tombe"
                title="Fiori sulle tombe"
                description="Consegna sulle tombe, con rete di fioristi locali in tutta Italia."
              />
              <TrePorteCard
                category="funerale"
                href="/per-il-funerale"
                title="Fiori per il Funerale"
                description="Camera ardente, chiesa e luoghi del commiato — con la stessa discrezione."
              />
              <TrePorteCard
                category="animali"
                href="/per-animali-domestici"
                title="Fiori per i Piccoli Amici"
                description="Omaggi dedicati agli animali di famiglia: piante e composizioni con cuore."
              />
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
        </div>
      </div>
    </div>
  );
}

