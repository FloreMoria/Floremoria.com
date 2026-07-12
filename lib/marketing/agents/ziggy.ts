export interface SocialPlatformGuidelines {
  audience: string;
  tone: string;
  copyRules: string[];
  imageRules: string[];
  hashtagsCount: number;
}

export const ZIGGY_PLATFORM_GUIDELINES: Record<string, SocialPlatformGuidelines> = {
  META_INSTAGRAM: {
    audience: "Clienti B2C, persone di mezza età e giovani adulti, che cercano vicinanza emotiva, commemorazione discreta e valore estetico.",
    tone: "Caldo, intimo, empatico, sobrio, sintonizzato sul dolore della distanza.",
    copyRules: [
      "Fermare lo scroll con un hook basato su verità emotiva o un piccolo gesto simbolico (es. 'Non sempre si può essere presenti').",
      "Evitare frasi sensazionalistiche, melodrammatiche o eccessivamente tristi.",
      "Preferire termini come 'presenza, vicinanza, ricordo, cura, stabilità, legame continuo'.",
      "Strutturare il testo in paragrafi brevi e scansionabili da mobile.",
      "Includere una Call to Action (CTA) sobria, focalizzata sull'aiutare o sul sollievo."
    ],
    imageRules: [
      "Stile 'Quiet Luxury': inquadratura editoriale, still life naturale, palette di colori desaturati (avorio, cipria, salvia, grigio pietra).",
      "Uso della luce naturale e diffusa, evitando contrasti forti o ombre dure.",
      "Mostrare composizioni reali nel loro contesto (es. appoggiate su legno invecchiato o pietra chiara).",
      "Assolutamente vietati: scritte sovrimpresse, loghi, persone in posa, o estetica cupa da agenzia funebre."
    ],
    hashtagsCount: 5
  },
  META_FACEBOOK: {
    audience: "Clienti B2C, demografica matura (anziani e famiglie), che cercano rassicurazione, affidabilità e storie che stringono le relazioni familiari.",
    tone: "Reassicurante, affettuoso, comunitario, orientato alla vicinanza familiare.",
    copyRules: [
      "Copy leggermente più disteso e narrativo rispetto a Instagram, focalizzato sul valore del ricordo continuo e sulla cura dei propri cari.",
      "Utilizzare storie semplici e comprensibili, stimolando una reazione emotiva pulita.",
      "Rassicurare sull'affidabilità e sulla serietà del servizio."
    ],
    imageRules: [
      "Immagini confortanti, calde e ad alta definizione.",
      "Dettagli floreali morbidi, composizioni armoniose e stabilità visiva."
    ],
    hashtagsCount: 5
  },
  LINKEDIN: {
    audience: "Partner B2B, agenzie di onoranze funebri, gestori di cimiteri, aziende interessate al welfare aziendale.",
    tone: "Professionale, istituzionale, solenne, orientato al valore e alla stima.",
    copyRules: [
      "Focus su partnership, serietà del servizio, welfare aziendale e rispetto per la memoria come valore fondante delle organizzazioni.",
      "Evitare toni confidenziali o troppo intimi; usare un linguaggio formale, sobrio ed elevato.",
      "Sottolineare la professionalità, la logistica impeccabile e la garanzia della consegna."
    ],
    imageRules: [
      "Still life professionale o composizione inserita in un contesto ordinato.",
      "Focus sulla qualità d'eccellenza della filiera floristica e sul rigore estetico."
    ],
    hashtagsCount: 4
  },
  TIKTOK: {
    audience: "Pubblico eterogeneo, demografica più giovane o orientata a contenuti autentici, spontanei ed in prima persona (UGC-feel).",
    tone: "Autentico, dinamico, umano, incentrato sul racconto personale.",
    copyRules: [
      "Hook verbale immediato nei primi 2 secondi (es. 'Come facciamo a portare un fiore a chi amiamo se siamo lontani?').",
      "Struttura rigida: Hook -> Body (spiegazione del servizio/gesto) -> Close (conclusione e invito).",
      "Utilizzare un linguaggio semplice, diretto e colloquiale."
    ],
    imageRules: [
      "Visual in formato verticale (9:16) con forte dinamismo o montaggio ritmato.",
      "Utilizzare scene che mostrano il 'dietro le quinte' o la preparazione reale (es. mani che compongono il bouquet, o il momento della consegna in stile POV/UGC)."
    ],
    hashtagsCount: 4
  }
};
