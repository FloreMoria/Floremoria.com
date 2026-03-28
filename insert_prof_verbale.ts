import prisma from './lib/prisma';

const FULL_CONTENT = `PREMESSA:
Il presente verbale attesta l'introduzione ufficiale della figura "Il Prof" all'interno dell'ecosistema di FloreMoria. Questa mossa risponde a un'impellente necessità di controllo architetturale di alto livello, volta a centralizzare e omogeneizzare le logiche di codice in forte scalata. Le precedenti sessioni operative, delegate in un contesto puramente orizzontale privo di Master Guard, avevano causato piccole deviazioni di UI e divergenze latenti sul database (troncamento stringhe su MySQL e inconsistenza CSS "dark mode"), minando la "stabilità visiva e dei metadati" del progetto E-commerce. Il brand "FloreMoria" non può tollerare difetti qualitativi. Diventa mandatoria la stesura del "Protocollo Master", la cui adozione sarà vincolante per qualsiasi modulo futuro, frontend o backend.

ANALISI:
Abbiamo eseguito un audit intensivo delle rotte Next.js, focalizzandoci sulla 'Dashboard' e sull'esposizione della Memoria Storica. L'analisi ha portato a queste rivelazioni inconfutabili:
1) Il database relazionale originario conteneva limitazioni inavvertite (VARCHAR) che asfissiavano il testo in arrivo, disinnescando il logging storico complesso. È stato mutato in PostgreSQL forzando @db.Text.
2) Lo scollamento tra layout e componenti figli causava "bleeding" visivo (temi grigi mischiati al layout Luce e Memoria).
3) La mancanza di un vincolo sintattico standard per i report faceva sì che i verbali passati risultassero disordinati in lettura.

Il Protocollo Master impone quindi da oggi i seguenti assiomi:
- Nessun dato Mock è più ammesso temporaneamente nei Client Components cruciali E-E-A-T (Dashboard, Recensioni, Verbali). Tutto deve agganciarsi immediatamente al Prisma layer.
- Modalità Editoriale Pura: Ogni blocco di lettura nativa deve azzerare i disturbi CSS ed esibirsi su tela puramente BIANCA, testo scuro antracite e spazi dilatati tipografici (leading-relaxed, tracking-widest per i sovra-titoli), sfruttando rigorosamente font con grazie (Serif).
- I tag devono disporre di un Link Router indipendente ("Client-Side Sync") per la navigazione profonda (Filtering cross-referenziale), sbrogliando il traffico da fetch manuali server-side inutili.

DECISIONE FINALE:
È stata deliberata all'unanimità l'implementazione del Protocollo Master e l'adozione dell'architettura "Zero-Scroll Dashboard", consolidando in un singolo viewport vitale tutto lo stream operativo, isolando invece nella stiva della rotta /logs l'infrastruttura di stoccaggio "Full Knowledge" di lettura zen. Ogni futuro agente (Claude, Devin o Gemini) deve ora documentare le modifiche macroscopiche strutturando il verbale nei tre paragrafi obbligatori (PREMESSA, ANALISI, DECISIONE). In aggiunta, si conferma l'istituzione della validazione soft-delete permanente su tutte le tabelle E-commerce critiche, come decretato precedentemente da "Nina" e la sicurezza backend.
Il Prof assume operatività totale e definitiva sul controllo qualità del progetto FloreMoria.`;

async function seedMissingVerbale() {
    console.log("Seeding / Updating Prof Master Protocol verbale...");
    
    // Check if the verbale already exists via Topic Match
    const existing = await prisma.floremoriaLog.findFirst({
        where: { topic: { contains: 'Protocollo Master' } }
    });

    if (existing) {
        console.log(`Trovato ID: ${existing.id}... Procedo con Update del testo arricchito (Over 2000chars).`);
        await prisma.floremoriaLog.update({
            where: { id: existing.id },
            data: {
                fullText: FULL_CONTENT
            }
        });
        console.log("Verbale Prof SOVRASCRITTO con successo! Database arricchito.");
        return;
    }

    // Se non esiste, lo creo
    await prisma.floremoriaLog.create({
        data: {
            sessionDate: new Date('2026-03-25T10:00:00.000Z'),
            tag: 'STRATEGIA, MASTER, PROTOCOLLO',
            topic: 'Nascita de Il Prof e Protocollo Master',
            shortSummary: 'Subentro de Il Prof come Master Agent, check up database e definizione del Pattern PREMESSA->ANALISI->DECISIONE.',
            fullText: FULL_CONTENT,
            keyPrompt: 'Prompt d\'innesco iniziale per Il Prof: ricostruire l\'autorità architetturale sui log e definire gerarchia grafica in Next.js.'
        }
    });
    console.log("Nuovo Verbale Prof INSERITO con successo! Database arricchito.");
}

seedMissingVerbale()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
