/**
 * Orchestrazione contenuti marketing & social FloreMoria (100% micro-video 2-3s a loop continuo).
 * Re-export e adapter operativo da src/agents/contentOrchestrator.
 */
export * from '@/src/agents/contentOrchestrator';

import { MarketingChannel } from '@prisma/client';
import { getChannelSpecificEditorialRules } from '@/src/agents/contentOrchestrator';

/**
 * Genera template copy deterministico per canale in caso di fallback o preview immediata.
 */
export function generateDeterministicChannelCopy(params: {
  channel: MarketingChannel;
  category?: string;
  productName?: string;
  deceasedName?: string | null;
}): { copy: string; hashtags: string[] } {
  const isFuneral = params.category === 'FF';
  const name = params.productName || (isFuneral ? 'Composizione Funebre' : 'Omaggio Floreale');

  switch (params.channel) {
    case MarketingChannel.META_INSTAGRAM:
      return {
        copy: [
          'La distanza non cancella il legame, né il desiderio di esserci.',
          `Con FloreMoria, ${name} viene deposto con rispetto e cura autentica.`,
          'Dopo la posa, ricevi la fotografia di conferma: una presenza reale e testimoniata per chi ami.',
          'Scopri il servizio sul link in bio.',
        ].join('\n\n'),
        hashtags: ['floremoria', 'omaggiofloreale', 'presenzaadistanza', 'fiorisulletombe', 'memoria'],
      };

    case MarketingChannel.TIKTOK:
      return {
        copy: [
          'Come prendersi cura di chi ami anche quando sei a chilometri di distanza?',
          `Un gesto autentico e discreto: ${name} consegnato dai nostri fioristi partner con foto di avvenuta posa.`,
          'Zero complicazioni, solo rispetto.',
          'Salva il video o visita il link in bio per saperne di più.',
        ].join('\n\n'),
        hashtags: ['floremoria', 'gestiautentici', 'omaggiofloreale', 'cura', 'ricordo'],
      };

    case MarketingChannel.META_FACEBOOK:
      return {
        copy: [
          'Un pensiero di affetto per la nostra famiglia, anche quando gli impegni o i chilometri non ci permettono di essere presenti.',
          `FloreMoria si occupa della preparazione e della posa di ${name} nel cimitero di riferimento, inviando una foto di conferma appena completata la consegna.`,
          'Un servizio semplice, trasparente e vicino alle esigenze delle famiglie.',
          'Trovi tutti i dettagli sul nostro sito: www.floremoria.com',
        ].join('\n\n'),
        hashtags: ['floremoria', 'famiglia', 'ricordodifamiglia', 'fioricimitero', 'vicinanza'],
      };

    case MarketingChannel.LINKEDIN:
      return {
        copy: [
          'Digitalizzazione e rispetto della tradizione floreale: il modello logistico di FloreMoria.',
          `Attraverso una rete selezionata di fioristi artigiani italiani, garantiamo la posa di ${name} con tracciamento digitale e invio della prova fotografica di conformità.`,
          'Un nuovo standard per il settore commemorativo, ideale anche per convenzioni aziendali, welfare e collaborazioni con agenzie funebri sul territorio.',
          'Scopri le opportunità di partnership su www.floremoria.com',
        ].join('\n\n'),
        hashtags: ['floremoria', 'innovazione', 'artigianatoitaliano', 'logisticaetica', 'welfareaziendale'],
      };

    default:
      return {
        copy: [
          'Un gesto di cura e rispetto, portato con discrezione.',
          `FloreMoria: ${name} con foto di conferma della posa.`,
          'Visita www.floremoria.com per maggiori informazioni.',
        ].join('\n\n'),
        hashtags: ['floremoria', 'omaggiofloreale', 'ricordo'],
      };
  }
}
