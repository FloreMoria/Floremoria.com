/**
 * Home pubblica (equivalente storico di index.html in stack Next.js App Router).
 * Sezioni: Hero → Ricerca → Tre Porte → Come funziona → Foto di conferma → Recensioni → Valori.
 * Assistente / comando umano: vedi `lib/floremDigitalAssistant.ts` e attributi `data-florem-*` sul wrapper.
 */
import { Metadata } from 'next';
import TrePorteSection from '@/components/TrePorteSection';
import BackgroundSwapper from '@/components/BackgroundSwapper';
import MunicipalitySearch from '@/components/MunicipalitySearch';
import Button from '@/components/Button';
import GoogleReviewsBar from '@/components/GoogleReviewsBar';
import TextParallax from '@/components/TextParallax';
import TrustBar from '@/components/TrustBar';
import CarouselFotoConferme from '@/components/CarouselFotoConferme';
import FotoPrimaConsegnaOptIn from '@/components/FotoPrimaConsegnaOptIn';
import prisma from '@/lib/prisma';
import CoreValues from '@/components/CoreValues';
import {
  FLOREM_DIGITAL_ASSISTANT_NAME,
  FLOREM_HUMAN_OPERATOR_TRIGGER,
} from '@/lib/floremDigitalAssistant';

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
    <div
      className="relative"
      data-florem-assistant={FLOREM_DIGITAL_ASSISTANT_NAME}
      data-florem-human-command={FLOREM_HUMAN_OPERATOR_TRIGGER}
    >
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
              Consegniamo bouquet di fiori freschi direttamente sulle tombe in tutta Italia e ti inviamo le foto sul tuo WhatsApp.
            </p>
          </TextParallax>
        </section>

        {/* Banner fiducia: ~3 cm più in alto rispetto al precedente posizionamento */}
        <div className="relative z-10 w-full mt-[calc(1.5rem-3cm)] md:mt-[calc(2.5rem-3cm)] lg:mt-[calc(3.5rem-3cm)] mb-1 lg:mb-2">
          <TrustBar compactBottom />
        </div>

        {/* Ordine sezioni: Ricerca → Tre porte → Come funziona → Foto → Recensioni → Valori */}
        <div className="relative z-10 w-full pt-3 lg:pt-5 pb-16 space-y-10 sm:space-y-14 lg:space-y-28">

          {/* 2) Ricerca */}
          <section id="search-section" className="bg-[#FDFCF9] rounded-[24px] lg:rounded-[40px] px-5 py-5 sm:p-8 lg:p-16 text-center max-w-4xl mx-auto shadow-[0_8px_40px_rgba(43,43,43,0.06)] border border-stone-200/80 scroll-mt-24 mx-4 xl:mx-auto">
            <h2 className="text-[24px] sm:text-[32px] font-display font-semibold text-fm-text leading-snug mb-2 sm:mb-4">
              Dove desideri inviare i fiori?
            </h2>
            <p className="text-fm-muted font-body text-[15px] sm:text-lg mb-4 sm:mb-8">
              Inserisci il nome del comune (Es. Como, Tivoli, Catania, ecc...)
            </p>
            <div className="max-w-md mx-auto relative z-10">
              <MunicipalitySearch />
            </div>
          </section>

          {/* 3) Tre porte — categorie */}
          <TrePorteSection />

          {/* 4) Come funziona */}
          <section className="max-w-6xl mx-auto bg-[#FDFCF9] rounded-[24px] lg:rounded-[28px] p-5 sm:p-8 lg:p-16 shadow-[0_8px_40px_rgba(43,43,43,0.05)] border border-stone-200/80 mx-4 xl:mx-auto">
            <div className="text-center mb-6 sm:mb-12">
              <h2 className="text-[24px] sm:text-[32px] font-display font-semibold text-fm-text leading-snug">
                Come funziona
              </h2>
              <p className="text-fm-muted text-[15px] sm:text-lg mt-2 sm:mt-4 font-body">
                Tre passaggi. Zero dubbi.
                <br />
                Presenza concreta anche a distanza.
              </p>
            </div>

            <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">
              <div className="rounded-2xl border border-stone-200 bg-white/70 px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#E6F3EA] flex items-center justify-center text-[#2F6B43] font-display font-bold text-base shadow-sm border border-white shrink-0">
                    1
                  </div>
                  <h3 className="text-[17px] sm:text-lg font-display font-bold text-fm-text">Tu ordini</h3>
                </div>
                <p className="mt-2.5 pl-[52px] text-fm-muted font-body text-[14px] sm:text-[15px] leading-relaxed">
                  Scegli la composizione e inserisci i dati.
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white/70 px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#B3DABF] flex items-center justify-center text-[#1C472A] font-display font-bold text-base shadow-sm border border-white shrink-0">
                    2
                  </div>
                  <h3 className="text-[17px] sm:text-lg font-display font-bold text-fm-text">Noi consegniamo</h3>
                </div>
                <p className="mt-2.5 pl-[52px] text-fm-muted font-body text-[14px] sm:text-[15px] leading-relaxed">
                  Il fiorista partner locale prepara e posa i fiori con cura.
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white/70 px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#2F6B43] flex items-center justify-center text-white font-display font-bold text-base shadow-md border border-white shrink-0">
                    3
                  </div>
                  <h3 className="text-[17px] sm:text-lg font-display font-bold text-fm-text">Ricevi conferma</h3>
                </div>
                <p className="mt-2.5 pl-[52px] text-fm-muted font-body text-[14px] sm:text-[15px] leading-relaxed">
                  Ricevi su WhatsApp le foto della consegna effettuata.
                </p>
              </div>
            </div>
          </section>

          {/* 5) Foto di conferma (MARK: valore percepito “GRATIS”; NINA: chiarezza immediata) */}
          <section
            id="foto-conferma"
            aria-labelledby="foto-conferma-heading"
            className="max-w-5xl mx-auto overflow-hidden rounded-[20px] lg:rounded-[28px] border border-stone-200/80 bg-[#F7F5F0] shadow-[0_8px_32px_rgba(43,43,43,0.05)] relative mx-4 lg:mx-auto"
          >
            <div className="relative z-10 flex flex-col md:flex-row items-stretch">
              <div className="w-full md:w-1/2 p-4 sm:p-8 lg:p-12 flex flex-col justify-between space-y-4 sm:space-y-8">
                <div className="space-y-3 sm:space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-fm-green/25 bg-fm-green-soft px-3 py-1 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-fm-green">
                      Gratis
                    </span>
                    <span className="font-body text-xs text-fm-muted">Foto dopo la consegna inclusa nell&apos;ordine</span>
                  </div>
                  <h2
                    id="foto-conferma-heading"
                    className="text-[20px] sm:text-[30px] md:text-3xl lg:text-4xl font-display font-semibold text-fm-text leading-snug"
                  >
                    Foto di conferma per ogni consegna
                  </h2>
                  <p className="rounded-xl border border-fm-gold/30 bg-white/90 px-3.5 sm:px-5 py-2.5 sm:py-4 font-display text-[13px] sm:text-[15px] font-semibold tracking-wide text-fm-text shadow-sm">
                    La foto con l&apos;omaggio già posato sul luogo — il nostro modo di restituirti serenità — è{' '}
                    <span className="whitespace-nowrap text-fm-gold">100% gratuita</span>, senza costi nascosti e senza
                    sorprese in fattura.
                  </p>
                  <p className="text-fm-text/80 font-body text-[14px] sm:text-lg leading-relaxed">
                    Sappiamo quanto conti avere una prova tangibile. Il fiorista documenta il lavoro svolto; ricevi tutto sul tuo WhatsApp, con la stessa cura che mettiamo in ogni dettaglio del servizio.
                  </p>
                  <FotoPrimaConsegnaOptIn />
                </div>
                
                <div className="pt-3 sm:pt-6 border-t border-fm-rose-soft/30 space-y-2.5 sm:space-y-4">
                  <h3 className="text-lg sm:text-2xl font-display font-bold text-fm-text">
                    Pronto a inviare il tuo omaggio?
                  </h3>
                  <Button href="#tre-porte" variant="primary" className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3.5 text-[15px] sm:text-lg shadow-md justify-center">
                    Invia ora
                  </Button>
                </div>
              </div>
              <div className="w-full md:w-1/2 bg-[#FDFCF9]/90 p-3.5 sm:p-8 lg:p-12 flex items-center justify-center border-t border-stone-200/60 md:border-t-0 md:border-l md:border-stone-200/60">
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

