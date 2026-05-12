import type { Metadata } from 'next';
import Image from 'next/image';
import styles from './print.module.css';

const SITE_URL = 'https://www.floremoria.com';
const HERO_PATH = '/images/marketing/volantino-b2b-hero.png';
const CATALOG_PATH = '/images/marketing/volantino-b2b-retro-catalogo.png';

export const metadata: Metadata = {
  title: 'Volantino B2B A5 | FloreMoria',
  description: 'Volantino fronte/retro per partnership con la filiera commemorativa e funeraria.',
  robots: { index: false, follow: false },
};

const FILIERA = [
  'Imprese di onoranze funebri',
  'Compagnie assicurative e servizi al cliente',
  'Agenzie organizzative e di supporto al lutto',
  'Urne, cofani e articoli funerari',
  'Bare, trasporti e allestimenti',
  'Necrologi e pubblicazione commemorativa',
  'Servizi per tombe, loculi e commemorazioni',
  'Digitalizzazione e gestione dei cimiteri',
  'Floricultori, grossisti e canali B2B',
  'Altri operatori della filiera — da definire insieme',
];

const PERCHE = [
  {
    t: 'Onoranze e agenzie',
    b: 'Migliorate l’esperienza del vostro cliente con fiori e consegne curate: il rapporto resta il vostro, noi rendiamo più fluido ciò che succede «dopo», senza sostituirvi.',
  },
  {
    t: 'Assicurazioni e servizi al lutto',
    b: 'Offrite percorsi chiari e misurabili: integriamo supporto floreale e digitale rispettando i vostri protocolli verso i beneficiari.',
  },
  {
    t: 'Urne, bare, accessori',
    b: 'Il cliente continua a comprare da voi: arricchite l’offerta con consegne e allestimenti sul territorio allineati alla vostra proposta commerciale.',
  },
  {
    t: 'Necrologi, commemorazione, digitale',
    b: 'Collegate servizi e contenuti senza sovrapporvi: tempi, tono e responsabilità verso le famiglie restano guidati da voi.',
  },
];

export default function VolantinoB2BPage() {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=192x192&margin=5&data=${encodeURIComponent(SITE_URL)}`;

  return (
    <div className={styles.wrap}>
      <div className={`${styles.screenHint} font-display space-y-2`}>
        <p>
          <strong>Istruzioni tipografia</strong> (volantino flyer, es.{' '}
          <a
            href="https://res.cloudinary.com/stampaestampe/image/upload/Istruzioni-File-Volantini-Flyer-477.pdf"
            className="text-[#1a4d7a] underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            PDF istruzioni file
          </a>
          ): <strong>due file separati</strong> per fronte e retro; risoluzione &gt; 300 dpi; colore{' '}
          <strong>CMYK</strong> (profilo consigliato <strong>FOGRA 39</strong>) — i PDF da browser sono
          RGB e verranno convertiti dal tipografo; <strong>abbondanze</strong> secondo prodotto;{' '}
          <strong>nessun crocino</strong> di taglio; font in curve se inviate grafiche vettoriali.
        </p>
        <p>
          <strong>PDF da browser:</strong> due salvataggi (pagina 1 e 2) oppure «Salva come PDF» a
          intervallo pagine — formato <strong>A5</strong>, grafica di sfondo attiva; nel layout c’è
          già un margine interno di <strong>0,5 cm per lato</strong> (area utile 138×200 mm).
        </p>
        <p>
          <strong>PDF automatico:</strong> con <code className="rounded bg-black/5 px-1">npm run dev</code>,{' '}
          <code className="rounded bg-black/5 px-1">npx playwright install chromium</code> (una volta), poi{' '}
          <code className="rounded bg-black/5 px-1">npm run pdf:volantino</code> →{' '}
          <code className="rounded bg-black/5 px-1">volantino-b2b-fronte.pdf</code> e{' '}
          <code className="rounded bg-black/5 px-1">volantino-b2b-retro.pdf</code>. Opzione nitidezza:{' '}
          <code className="rounded bg-black/5 px-1">PDF_DEVICE_SCALE=3</code> (default 2).
        </p>
      </div>

      {/* ——— Fronte ——— */}
      <section
        className={`${styles.sheet} flex min-h-0 flex-col bg-[#e4ddd3]`}
        aria-label="Volantino fronte"
      >
        {/* Fascia ampia: ancoraggio in alto per non tagliare il volto */}
        <div className="relative h-[52mm] w-full shrink-0 border-b-2 border-[#a8987c] bg-[#2a2622]">
          <Image
            src={HERO_PATH}
            alt=""
            fill
            className="object-cover object-top opacity-[0.98]"
            sizes="138mm"
            priority
          />
        </div>

        <div className="flex h-full min-h-0 flex-1 flex-col bg-gradient-to-b from-[#ebe4da] via-[#e8e1d6] to-[#dfd5c9]">
          <header className="flex shrink-0 items-center gap-2.5 border-b border-[#c9bdae] px-[4.5mm] py-[1.75mm]">
            <Image
              src="/images/brand/Logo FloreMoria.png"
              alt=""
              width={42}
              height={40}
              className="h-11 w-auto shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="font-display text-[12px] font-bold uppercase tracking-[0.1em] text-[#1e2630]">
                FloreMoria per il B2B
              </p>
              <p className="font-body text-[10px] leading-snug text-[#4d5560]">
                Fiori freschi, tombe e servizi digitali — collaborazioni con la filiera del ricordo
              </p>
            </div>
          </header>

          <div className="mx-[3.5mm] mt-[1.75mm] rounded-sm border border-[#c9bdae]/80 bg-[#d8cfc3]/90 px-[3mm] py-[1.75mm] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
            <p className="font-body text-[10px] font-medium leading-snug text-[#2a323c]">
              <strong className="font-display text-[#1a2332]">Il cliente resta vostro.</strong> Non
              sostituiamo ciò che già offrite:{' '}
              <span className="text-[#1e2630]">
                miglioriamo la qualità percepita e rendiamo più fluida l’operazione per famiglie e
                staff
              </span>
              , con logistica floreale e strumenti digitali che si agganciano al vostro servizio —
              senza confondere i ruoli né intercettare il rapporto commerciale.
            </p>
          </div>

          {/* Blocco testi: distribuito in verticale per evitare vuoti sotto */}
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-[1.25mm] px-[3.5mm] pb-[3mm] pt-[1.75mm]">
            <div>
              <h1 className="font-display text-[14px] font-bold leading-[1.2] tracking-tight text-[#1a2332]">
                Una collaborazione utile a tutta la filiera
              </h1>
              <p className="mt-[1.25mm] font-body text-[10px] leading-relaxed text-[#3a424c]">
                Operiamo in Italia su consegne sulle tombe, allestimenti e cataloghi dedicati. Il
                valore per voi è nella continuità: più serenità operativa per chi vi affida, senza
                duplicare strutture o canali che già gestite bene. Possiamo affiancarvi in fiera, in
                sede o da remoto per definire passi concreti e tempi realistici.
              </p>
            </div>

            <div>
              <p className="font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#5c5349]">
                Con chi parliamo
              </p>
              <ul className="mt-[1.1mm] grid grid-cols-2 gap-x-[2mm] gap-y-[0.85mm] font-body text-[9.5px] leading-snug text-[#2b3238]">
                {FILIERA.map((label) => (
                  <li key={label} className="flex gap-1">
                    <span
                      className="mt-[0.2em] h-[6px] w-[6px] shrink-0 rounded-full bg-[#a08050]"
                      aria-hidden
                    />
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-h-0 -mt-[10mm] border-t border-[#c9bdae]/70 pt-[1.25mm]">
              <p className="font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#5c5349]">
                Perché può convenire a tutti
              </p>
              <ul className="mt-[1.1mm] grid grid-cols-2 gap-x-[2mm] gap-y-[1.05mm] font-body text-[9.5px] leading-snug text-[#2b3238]">
                {PERCHE.map(({ t, b }) => (
                  <li key={t} className="min-w-0">
                    <span className="font-display font-semibold text-[#1a2332]">{t}. </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Retro ——— */}
      <section
        className={`${styles.sheet} flex min-h-0 flex-col bg-[#e4ddd3]`}
        aria-label="Volantino retro"
      >
        <div className="flex h-full min-h-0 flex-1 flex-col bg-gradient-to-b from-[#ebe4da] to-[#d8cfc3]">
          <div className="shrink-0 px-[5mm] pb-[1.25mm] pt-[2.75mm]">
            <div className="mb-[1.25mm] h-[2px] w-12 rounded-full bg-[#9a7b52]" aria-hidden />
            <h2 className="font-display text-[14px] font-bold leading-tight text-[#1a2332]">
              Come costruiamo la partnership
            </h2>
            <p className="mt-[1.25mm] font-body text-[10px] leading-relaxed text-[#3a424c]">
              Partiamo dal rispetto del vostro modello: obiettivi, canali, privacy e immagine sono
              condivisi in anticipo. Poi definiamo accordi commerciali e flussi (link, codici,
              convenzioni, integrazioni dove possibile) in modo che{' '}
              <strong className="font-medium text-[#2a323c]">
                il vostro cliente percepisca un solo percorso coerente
              </strong>
              , con meno attriti operativi per il vostro team.
            </p>
          </div>

          {/* Immagine: occupa tutto lo spazio verticale residuo, sempre per intero */}
          <div className="relative min-h-[44mm] w-full flex-1 border-y border-[#b5a896]/80 bg-[#d8d2ca]">
            <Image
              src={CATALOG_PATH}
              alt=""
              fill
              className="object-contain object-center p-[1.5mm]"
              sizes="138mm"
            />
          </div>

          <div className="flex min-h-0 shrink-0 flex-col justify-between gap-[1.25mm] px-[5mm] pb-[4mm] pt-[1.75mm]">
            <div>
              <p className="font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#5c5349]">
                Cosa mettiamo sul tavolo
              </p>
              <ul className="mt-[1.25mm] grid grid-cols-2 gap-x-[2.5mm] gap-y-[1.05mm] font-body text-[9.5px] leading-snug text-[#2b3238]">
              <li className="flex min-w-0 gap-1.5">
                <span className="font-display font-bold text-[#8a6d45]">·</span>
                <span>
                  <strong className="font-medium text-[#1a2332]">Cataloghi curati:</strong> tombe,
                  funerale, commemorazioni per animali domestici — tono e immagini allineati al
                  momento del ricordo.
                </span>
              </li>
              <li className="flex min-w-0 gap-1.5">
                <span className="font-display font-bold text-[#8a6d45]">·</span>
                <span>
                  <strong className="font-medium text-[#1a2332]">Rete e processi:</strong> fioristi
                  selezionati e consegne chiare per staff e famiglie, senza sostituire i vostri
                  contatti né le vostre condizioni commerciali.
                </span>
              </li>
              <li className="flex min-w-0 gap-1.5">
                <span className="font-display font-bold text-[#8a6d45]">·</span>
                <span>
                  <strong className="font-medium text-[#1a2332]">Trasparenza:</strong> dove
                  previsto, conferma fotografica delle consegne come supporto operativo al vostro
                  servizio.
                </span>
              </li>
              <li className="flex min-w-0 gap-1.5">
                <span className="font-display font-bold text-[#8a6d45]">·</span>
                <span>
                  <strong className="font-medium text-[#1a2332]">Digitale:</strong> floremoria.com e
                  progetti congiunti con il vostro brand — sempre come estensione, non come
                  sostituto.
                </span>
              </li>
              </ul>

              <p className="mt-[1.5mm] rounded-sm border border-[#b8ab9a] bg-[#cfc4b6]/65 px-[3mm] py-[1.75mm] font-body text-[9.5px] leading-snug text-[#424a52]">
                <strong className="font-display text-[#1a2332]">Rispetto.</strong> Evitiamo toni
                promozionali invadenti: privilegiamo chiarezza, tempi umani e un linguaggio adeguato al
                lutto.
              </p>
            </div>

            <footer className="border-t border-[#c9bdae] pb-[3.5mm] pt-[2mm]">
              <div className="grid grid-cols-[1fr_auto] items-end gap-[3mm]">
                <div className="min-w-0 space-y-[0.65mm] font-body text-[9.5px] leading-relaxed text-[#4a5258]">
                  <p className="font-display text-[10.5px] font-semibold text-[#1a2332]">
                    Floremoria S.r.l.
                  </p>
                  <p>Via Bellinzona 82/B, 22100 Como (CO)</p>
                  <p>
                    Tel.{' '}
                    <a
                      href="tel:+393204105305"
                      className="text-[#1a4d7a] underline-offset-2 print:text-inherit print:no-underline"
                    >
                      +39 320 410 5305
                    </a>
                  </p>
                  <p>
                    <a
                      href="mailto:assistenza@floremoria.com"
                      className="break-all text-[#1a4d7a] underline-offset-2 print:text-inherit print:no-underline"
                    >
                      assistenza@floremoria.com
                    </a>
                  </p>
                  <p className="text-[#5c6570]">
                    PEC floremoria@pec.it · P.IVA / C.F. 04188260139 · Cod. univoco K0ROACV
                  </p>
                </div>
                <div className="flex shrink-0 -translate-x-[5mm] flex-col items-center gap-1 pb-[0.5mm]">
                  <Image
                    src={qrSrc}
                    alt=""
                    width={84}
                    height={84}
                    unoptimized
                    className="block rounded-sm border border-[#b8ab9a] bg-white"
                  />
                  <span className="max-w-[24mm] px-[0.5mm] text-center font-body text-[8.5px] leading-snug text-[#5c6570]">
                    {SITE_URL.replace(/^https:\/\//, '')}
                  </span>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
}
