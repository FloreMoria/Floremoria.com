import type { Metadata } from 'next';
import Image from 'next/image';
import { buildGenericAlt } from '@/utils/altText';
import MunicipalitySearch from '@/components/MunicipalitySearch';

export const metadata: Metadata = {
    title: 'Chi Siamo | FloreMoria',
    description: 'Scopri chi siamo e perché ci dedichiamo alla cura della memoria. FloreMoria unisce persone e territori con un servizio innovativo e sostenibile.',
};

export default function ChiSiamoPage() {
    return (
        <article className="w-full bg-fm-bg min-h-screen">
            {/* 1) HERO SECTION CHI SIAMO */}
            <section className="relative w-full h-[50vh] min-h-[380px] md:min-h-[440px] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 z-0 bg-[#352520]">
                    <Image
                        src="/images/hero/consegna-fiori-cimitero-artigianalita-floremoria-chi-siamo.webp"
                        alt={buildGenericAlt('hero', 'La nostra missione FloreMoria')}
                        fill
                        className="object-cover object-center brightness-[1.1] saturate-[1.15]"
                        priority
                    />
                    {/* Filtro vibrazione e luminosità */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/10 pointer-events-none"></div>
                </div>

                <div className="relative z-10 text-center px-4 max-w-4xl mx-auto drop-shadow-lg mt-[72px]">
                    <span className="bg-fm-rose text-white text-[11px] font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full shadow-md mb-4 inline-block">
                        L&apos;Azienda
                    </span>
                    <h1 className="text-3xl md:text-[48px] lg:text-[64px] font-display font-bold text-white leading-tight tracking-tight drop-shadow-[0_2px_15px_rgba(0,0,0,0.6)]">
                        La nostra missione: <br className="hidden md:block" />
                        <span className="text-fm-rose-soft">onorare il ricordo</span>
                    </h1>
                </div>
            </section>

            {/* 2) STORYTELLING E VETRO (GLASSMORPHISM) */}
            <div className="max-w-6xl mx-auto px-4 lg:px-8 py-10 lg:py-16 space-y-12 lg:space-y-16">

                {/* Blocco 1: Testo a sinistra (Sovrapposto al centro/vuoto) / Immagine a destra */}
                <section className="relative flex flex-col md:flex-row items-center justify-between gap-6 lg:gap-0">
                    {/* Testo Glassmorphism (Sovrapposto su Desktop) */}
                    <div className="relative z-20 w-full md:w-5/12 md:-mr-8 lg:-mr-16 pt-2 md:pt-0 shrink-0">
                        <div className="bg-white/40 md:bg-white/70 backdrop-blur-xl border border-white/50 rounded-[24px] p-5 sm:p-6 lg:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
                            <h2 className="text-[24px] sm:text-[28px] font-display font-semibold text-fm-text leading-snug mb-4">
                                La nostra storia
                            </h2>
                            <div className="text-[15px] sm:text-[16px] text-fm-text/80 font-body leading-relaxed space-y-3">
                                <p>
                                    FloreMoria nasce da un’idea semplice ma profondamente umana: permettere a chiunque, ovunque si trovi, di portare un gesto di affetto e memoria sulla tomba dei propri cari.
                                </p>
                                <p>
                                    Sempre più persone vivono lontano dal luogo dove riposano i loro affetti. La distanza non sempre permette di essere presenti fisicamente, ma il bisogno di ricordare resta intatto, forte e radicato.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Immagine */}
                    <div className="relative w-full md:w-8/12 aspect-[4/3] lg:aspect-video rounded-[24px] overflow-hidden shadow-2xl z-10">
                        <Image
                            src="/images/hero/foto-consegna-fiori-tomba-trasparenza-floremoria-chi-siamo.webp"
                            alt={buildGenericAlt('section', 'Trasparenza consegna fiori cimitero')}
                            fill
                            className="object-cover object-center hover:scale-105 transition-transform duration-700"
                        />
                    </div>
                </section>

                {/* Blocco 2: Testo Centrale Enfatizzato (Senza Immagine se non ci sono più chi-siamo webp) */}
                <section className="relative flex flex-col items-center text-center max-w-4xl mx-auto">
                    <div className="inline-flex w-14 h-1.5 bg-fm-rose/20 rounded-full mb-5"></div>
                    <h2 className="text-[26px] sm:text-[32px] font-display font-bold text-fm-text leading-tight mb-5">
                        Innovazione e sostenibilità
                    </h2>
                    <div className="text-[16px] sm:text-lg text-fm-muted font-body leading-relaxed space-y-4">
                        <p>
                            Siamo una startup innovativa nata in Italia e costruita interamente in digitale. Condividiamo una visione potente: utilizzare la tecnologia per facilitare ed elevare il modo in cui le persone vivono e curano il ricordo emozionale.
                        </p>
                        <p className="text-fm-text font-medium bg-fm-section px-5 py-4 rounded-2xl inline-block shadow-sm">
                            Riduciamo le emissioni con consegne locali a km0, senza l&apos;uso di fastidiose plastiche, operando su server green per ridurre l&apos;impatto ecosistemico di ogni gesto affettuoso.
                        </p>
                    </div>
                </section>

                {/* Blocco 3: Immagine a Sinistra / Testo a Destra */}
                <section className="relative flex flex-col md:flex-row-reverse items-center justify-between gap-6 lg:gap-0">
                    <div className="relative z-20 w-full md:w-5/12 md:-ml-8 lg:-ml-16 shrink-0">
                        <div className="bg-white/40 md:bg-white/70 backdrop-blur-xl border border-white/50 rounded-[24px] p-5 sm:p-6 lg:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
                            <h2 className="text-[24px] sm:text-[28px] font-display font-semibold text-fm-text leading-snug mb-4">
                                Una rete di valore
                            </h2>
                            <div className="text-[15px] sm:text-[16px] text-fm-text/80 font-body leading-relaxed space-y-3">
                                <p>
                                    Scegliere FloreMoria significa sostenere in modo diretto l&apos;etica e la rete dei fioristi locali in continua crescita in tutta la penisola italiana.
                                </p>
                                <p>
                                    Collaboriamo esclusivamente con professionisti selezionati per la loro sensibilità e cura. Oltre agli omaggi, curiamo personalmente funerali, istituzioni pubbliche e private.
                                </p>
                                <p className="font-semibold text-fm-rose mt-4 block">
                                    Affidabilità al centro del territorio.
                                </p>
                                <div className="mt-5 flex items-center gap-3 bg-white/60 p-3.5 rounded-2xl border border-white/50 shadow-sm">
                                    <Image src="/logo-made-in-italy-v2.webp" alt="Sigillo Made in Italy" width={46} height={46} className="object-contain drop-shadow-sm shrink-0" />
                                    <p className="text-[12px] text-fm-text/90 font-medium leading-snug">
                                        Un impegno autentico per l&apos;eccellenza artigianale italiana. Ogni nostra composizione &egrave; curata da mani esperte sul territorio, garantendo il rispetto della tradizione e la freschezza del &quot;Prodotto in Italia&quot;.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative w-full md:w-8/12 aspect-[4/3] lg:aspect-video rounded-[24px] overflow-hidden shadow-2xl z-10 bg-gray-100">
                        {/* Utilizziamo l'immagine di rete locale per questo riquadro */}
                        <Image
                            src="/images/hero/consegna-fiori-cimitero-rete-floremoria-chi-siamo.webp"
                            alt="Logistica e artigianato floreale"
                            fill
                            className="object-cover object-center object-bottom hover:scale-105 transition-transform duration-700"
                        />
                    </div>
                </section>

                {/* FINAL SECTION: WHERE TO SEND FLOWERS */}
                <section className="bg-white rounded-[22px] lg:rounded-[40px] px-5 py-5 sm:p-7 lg:p-12 text-center max-w-4xl mx-auto shadow-lg border border-gray-100 scroll-mt-24 mt-6 md:mt-10">
                    <h2 className="text-[22px] sm:text-[28px] font-display font-semibold text-fm-text leading-snug mb-3">
                        Dove desideri inviare fiori?
                    </h2>
                    <p className="text-fm-muted font-body text-[14px] sm:text-base mb-4 sm:mb-6">
                        Inserisci il nome del comune (Es. Como, Tivoli, Catania, ecc...)
                    </p>
                    <div className="max-w-xl mx-auto relative z-10">
                        <MunicipalitySearch
                            showButton={true}
                            buttonText="Vedi i Bouquet"
                            placeholder="Cerca un comune..."
                        />
                    </div>
                </section>

            </div>
        </article>
    );
}
