import { Metadata } from 'next';
import Image from 'next/image';
import { products } from '@/lib/products';
import Link from 'next/link';
import MunicipalitySearch from '@/components/MunicipalitySearch';
import ProductCard from '@/components/ProductCard';
import Button from '@/components/Button';
import GoogleReviewsBar from '@/components/GoogleReviewsBar';
import TextParallax from '@/components/TextParallax';

export const metadata: Metadata = {
  title: 'FloreMoria | Invia fiori al cimitero in tutta Italia',
  description: 'Consegna fiori sulle tombe e nei cimiteri in Italia tramite fioristi partner. Per ogni servizio riceverai una foto di conferma per rassicurarti.',
};

export default function Home() {
  return (
    <div className="relative w-full bg-fm-bg">
      {/* 1) NATIVE HERO SECTION */}
      <section className="relative w-full pt-[72px] grid grid-cols-1 grid-rows-1 justify-items-center">
        {/* The Native Image */}
        <Image
          src="/images/hero/consegna-fiori-cimitero-home-floremoria.webp"
          alt="Consegna fiori cimitero FloreMoria"
          width={1536}
          height={1024}
          className="col-start-1 row-start-1 w-full h-auto max-h-none object-contain block"
          priority
        />
        {/* Subtle overlay for text readability */}
        <div className="col-start-1 row-start-1 bg-gradient-to-b from-white/10 via-transparent to-black/5 pointer-events-none w-full h-full"></div>

        {/* Text Overlay */}
        <div className="col-start-1 row-start-1 flex flex-col justify-start items-center pt-8 md:pt-16 lg:pt-24 max-w-4xl px-4 drop-shadow-lg text-center w-full relative z-10">
          <TextParallax speed={-0.4} className="space-y-4 md:space-y-6">
            <h1 className="text-4xl md:text-[56px] font-display font-bold text-white leading-tight tracking-tight drop-shadow-[0_2px_15px_rgba(0,0,0,0.6)]">
              FloreMoria
            </h1>
            <h2 className="text-2xl md:text-3xl text-fm-rose-soft font-semibold tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              I fiori della memoria
            </h2>
            <p className="text-lg md:text-xl text-white/95 font-medium font-body leading-relaxed max-w-2xl mx-auto bg-black/40 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/20 shadow-xl">
              Consegniamo bouquet di fiori freschi direttamente sulle tombe in tutta Italia e ti inviamo la foto sul tuo WhatsApp.
            </p>
          </TextParallax>
        </div>
      </section>

      {/* CONTAINER FOR PAGE CONTENT */}
      <div className="relative z-10 w-full pt-12 md:pt-16 pb-16 space-y-16 lg:space-y-32 bg-fm-bg">

          {/* (Trust Bar removed from here) */}

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

          {/* 3) HOW IT WORKS */}
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
                <div className="w-20 h-20 rounded-full bg-fm-cta-soft flex items-center justify-center text-fm-cta font-display font-bold text-2xl shadow-sm border border-white">
                  1
                </div>
                <h3 className="text-xl font-display font-semibold text-fm-text mt-4">Ordina l&apos;omaggio</h3>
                <p className="text-fm-muted font-body leading-relaxed">
                  Seleziona l&apos;omaggio floreale e inserisci i dettagli del cimitero e del defunto.
                </p>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center text-center space-y-4 relative z-10">
                <div className="w-20 h-20 rounded-full bg-fm-rose-soft flex items-center justify-center text-fm-rose font-display font-bold text-2xl shadow-sm border border-white">
                  2
                </div>
                <h3 className="text-xl font-display font-semibold text-fm-text mt-4">Il fiorista consegna</h3>
                <p className="text-fm-muted font-body leading-relaxed">
                  Un fiorista partner locale si occuperà di preparare e recapitare i fiori con rispetto. La consegna è sempre gratuita.
                </p>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center space-y-4 relative z-10">
                <div className="w-20 h-20 rounded-full bg-fm-section flex items-center justify-center text-fm-text font-display font-bold text-2xl shadow-sm border border-white">
                  3
                </div>
                <h3 className="text-xl font-display font-semibold text-fm-text mt-4">Ricevi la foto di conferma</h3>
                <p className="text-fm-muted font-body leading-relaxed">
                  Al termine, riceverai una foto del fiore posato, garantendoti la massima trasparenza.
                </p>
              </div>
            </div>
          </section>

          {/* 3.5) TRUST / REVIEWS SECTION */}
          <section id="reviews" className="max-w-6xl mx-auto w-full">
            <GoogleReviewsBar />
          </section>

          {/* 4) OMAGGI FLOREALI GRID */}
          <section className="max-w-6xl mx-auto bg-white rounded-[30px] p-8 lg:p-16 shadow-xl border border-gray-100 mx-4 xl:mx-auto">
            <div className="flex justify-between items-end border-b border-fm-rose-soft/30 pb-4 mb-8">
              <h2 className="text-[32px] font-display font-semibold text-fm-text leading-snug">
                Omaggi floreali
              </h2>
              <Link
                href="/fiori-sulle-tombe"
                className="hidden sm:inline-flex items-center text-fm-text hover:text-fm-cta font-medium font-body transition-colors hover:underline"
              >
                Vedi tutti &rarr;
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {['bouquet-ricordo-affettuoso', 'bouquet-di-rose', 'bouquet-omaggio-speciale', 'bouquet-tributo-eterno', 'lumino', 'messaggio']
                .map(slug => products.find(p => p.slug === slug))
                .filter((p): p is NonNullable<typeof p> => p !== undefined)
                .slice(0, 6).map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
            </div>

            <div className="mt-8 text-center sm:hidden">
              <Link
                href="/fiori-sulle-tombe"
                className="inline-flex items-center text-fm-text hover:text-fm-cta font-medium font-body transition-colors hover:underline"
              >
                Vedi tutto il catalogo &rarr;
              </Link>
            </div>
          </section>

          {/* 5) TRUST / PROOF */}
          <section className="max-w-5xl mx-auto bg-[#FBF6EF] rounded-[30px] shadow-xl overflow-hidden relative mx-4 lg:mx-auto">
            <div className="relative z-10 flex flex-col md:flex-row items-stretch min-h-[400px]">
              <div className="w-full md:w-1/2 p-8 lg:p-16 space-y-6 flex flex-col justify-center">
                <h2 className="text-[32px] md:text-3xl lg:text-4xl font-display font-semibold text-fm-text leading-snug">
                  Foto di conferma per ogni consegna
                </h2>
                <p className="text-fm-text/80 font-body text-lg leading-relaxed">
                  Sappiamo quanto sia importante per te. Per questo, ogni nostro fiorista è tenuto a scattare una fotografia una volta che l&apos;omaggio floreale è stato gentilmente posato sulla tomba del tuo caro. Riceverai la foto su WhatsApp e nel tuo profilo utente.
                </p>
              </div>
              <div className="w-full md:w-1/2 bg-white/40 p-8 lg:p-16 flex items-center justify-center border-t md:border-t-0 md:border-l border-white/50">
                {/* Placeholder visual element */}
                <div className="w-full aspect-video md:aspect-square lg:aspect-video bg-white/60 rounded-xl border-2 border-dashed border-[#dcd2c6] flex items-center justify-center text-[#8e857b] font-display font-medium text-center p-6 shadow-sm">
                  <span className="opacity-80">
                    [ Placeholder Immagine: Collage di conferme visive ]
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 6) FINAL CTA */}
          <section className="text-center py-12 lg:py-24 max-w-2xl mx-auto space-y-8 px-4 bg-white rounded-[30px] shadow-xl border border-gray-100 mt-16 mx-4 md:mx-auto">
            <h2 className="text-[32px] md:text-4xl font-display font-bold text-fm-text leading-tight">
              Pronto a inviare il tuo omaggio floreale?
            </h2>
            <p className="text-fm-muted text-lg font-body">
              Usa la nostra ricerca rapida e controlla la copertura nel tuo comune. Troverai i fiori ideali per esprimere la tua vicinanza.
            </p>
            <Button href="#search-section" variant="primary" className="mt-4 px-10 py-4 text-lg">
              Inizia ora
            </Button>
          </section>

        </div>
      </div>
  );
}
