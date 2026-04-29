import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const protocols = [
    {
      sessionDate: new Date('2026-04-02T12:00:00Z'),
      tag: 'PROTOCOL',
      topic: 'PROTOCOLLO 100 - Consolidamento Workflow Antigravity',
      keyPrompt: 'RACCOLTA VERBALI ESECUTIVI - PROTOCOLLO 100',
      shortSummary: 'Consolidamento Workflow Antigravity.',
      fullText: `STATO: Consolidamento Workflow Antigravity.
DISPOSIZIONI: Approvata la procedura di modifiche incrementali "step by step". Ogni variazione estetica deve essere validata prima di procedere alla successiva per evitare regressioni nel design.`
    },
    {
      sessionDate: new Date('2026-04-11T12:00:00Z'),
      tag: 'PROTOCOL',
      topic: 'PROTOCOLLO 101 - Strategia Multi-Agent',
      keyPrompt: 'RACCOLTA VERBALI ESECUTIVI - PROTOCOLLO 101',
      shortSummary: 'Strategia Multi-Agent.',
      fullText: `STATO: Strategia Multi-Agent.
DISPOSIZIONI: Obbligo di attivazione di agenti AI specializzati (Petra, Devin, Barbara, Alberto, Mark, Nina) per ogni task complesso. In assenza di un profilo specifico, si dispone la creazione immediata del nuovo agente.`
    },
    {
      sessionDate: new Date('2026-04-14T12:00:00Z'),
      tag: 'PROTOCOL',
      topic: 'PROTOCOLLO 102 - Standardizzazione Categorie Email',
      keyPrompt: 'RACCOLTA VERBALI ESECUTIVI - PROTOCOLLO 102',
      shortSummary: 'Standardizzazione Categorie Email.',
      fullText: `STATO: Standardizzazione Categorie Email.
DISPOSIZIONI: Definizione delle 4 varianti ufficiali per il funnel di vendita: Categoria FF (Funerale), FT (Fiori sulle Tombe), FA (Fiori e Accessori) e FP (Piante in Vaso).`
    },
    {
      sessionDate: new Date('2026-04-27T12:00:00Z'),
      tag: 'PROTOCOL',
      topic: 'PROTOCOLLO 103 - Revisione Terminologica "Piccoli Amici"',
      keyPrompt: 'RACCOLTA VERBALI ESECUTIVI - PROTOCOLLO 103',
      shortSummary: 'Revisione Terminologica "Piccoli Amici".',
      fullText: `STATO: Revisione Terminologica "Piccoli Amici".
DISPOSIZIONI: Sostituzione totale del termine clinico "Animale" con la locuzione "Piccoli Amici" (navigazione) e "Compagni di Vita" (copy emozionale) per la categoria FA.`
    },
    {
      sessionDate: new Date('2026-04-27T12:05:00Z'),
      tag: 'PROTOCOL',
      topic: 'PROTOCOLLO 104 - Sblocco Dominio floremoria.com',
      keyPrompt: 'RACCOLTA VERBALI ESECUTIVI - PROTOCOLLO 104',
      shortSummary: 'Sblocco Dominio floremoria.com.',
      fullText: `STATO: Sblocco Dominio floremoria.com.
DISPOSIZIONI: Gestione crisi trasferimento Wix-Aruba. Autorizzato lo sblocco del lucchetto ICANN (clientTransferProhibited) tramite comando "Desidero ancora trasferire" su pannello Wix.`
    },
    {
      sessionDate: new Date('2026-04-27T12:10:00Z'),
      tag: 'PROTOCOL',
      topic: 'PROTOCOLLO 105 - Business Continuity & Hosting',
      keyPrompt: 'RACCOLTA VERBALI ESECUTIVI - PROTOCOLLO 105',
      shortSummary: 'Business Continuity & Hosting.',
      fullText: `STATO: Business Continuity & Hosting.
DISPOSIZIONI: Autorizzato rinnovo tecnico Hosting Linux Aruba per evitare blackout. Mantenimento partnership "Annunci Funebri" attiva durante la migrazione al nuovo VPS.`
    },
    {
      sessionDate: new Date('2026-04-28T12:00:00Z'),
      tag: 'PROTOCOL',
      topic: 'PROTOCOLLO 106 - Pivot Progetto Istituzionale',
      keyPrompt: 'RACCOLTA VERBALI ESECUTIVI - PROTOCOLLO 106',
      shortSummary: 'Pivot Progetto Istituzionale.',
      fullText: `STATO: Pivot Progetto Istituzionale.
DISPOSIZIONI: Conversione progetto "Manutenzione" in "Servizi Civici FloreMoria". Focus: Cerimoniale e Cultura. Approvata la scalabilità a carnet (3 Corone automatiche + bouquet a scalare).`
    },
    {
      sessionDate: new Date('2026-04-28T12:05:00Z'),
      tag: 'PROTOCOL',
      topic: 'PROTOCOLLO 107 - Trust Identity "Made in Italy"',
      keyPrompt: 'RACCOLTA VERBALI ESECUTIVI - PROTOCOLLO 107',
      shortSummary: 'Trust Identity "Made in Italy".',
      fullText: `STATO: Trust Identity "Made in Italy".
DISPOSIZIONI: Approvazione del logo "Made in Italy" come sigillo di garanzia per residenti all'estero. Posizionamento: Footer, Checkout e sezione Identità.`
    },
    {
      sessionDate: new Date('2026-04-28T12:10:00Z'),
      tag: 'PROTOCOL',
      topic: 'PROTOCOLLO 108 - Definizione Modello Commerciale PA',
      keyPrompt: 'RACCOLTA VERBALI ESECUTIVI - PROTOCOLLO 108',
      shortSummary: 'Definizione Modello Commerciale PA.',
      fullText: `STATO: Definizione Modello Commerciale PA.
DISPOSIZIONI: Ratifica listino a 4 fasce (Silver €749, Gold €1499, Platinum €2499, Elite). Introduzione del pagamento dilazionato in 10 rate per i Comuni.`
    },
    {
      sessionDate: new Date('2026-04-28T12:15:00Z'),
      tag: 'PROTOCOL',
      topic: 'PROTOCOLLO 109 - UX Dashboard "Servizi Civici"',
      keyPrompt: 'RACCOLTA VERBALI ESECUTIVI - PROTOCOLLO 109',
      shortSummary: 'UX Dashboard "Servizi Civici".',
      fullText: `STATO: UX Dashboard "Servizi Civici".
DISPOSIZIONI: Approvazione mockup dashboard con contatore bouquet dinamico. Obbligo di attivazione via Web/Mail per tracciabilità amministrativa (Zero telefono).`
    }
  ];

  for (const protocol of protocols) {
    await prisma.floremoriaLog.create({
      data: protocol
    });
    console.log(`Inserted: ${protocol.topic}`);
  }
  
  console.log("All protocols 100-109 inserted successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
