import prisma from './lib/prisma';

const FULL_CONTENT = `PREMESSA:
Risoluzione bug Dashboard e allineamento archivio verbali. Oggi ci siamo concentrati sulla stabilizzazione definitiva dell'infrastruttura di tracciamento e della navigazione interna, per permettere una consultazione fluida della Memoria Storica aziendale.

ANALISI:
Difficoltà di Antigravity nel gestire il routing dinamico e la visualizzazione del fullText. I bug principali consistevano in link errati (404) a causa della rilocazione delle directory in App Router, errata lettura dei parametri URL per l'API di filtraggio, e persistenza di cache e temi scuri (bleeding css) sulle rotte isolate. Occorreva uniformare la gestione dei tag per la ricerca incrociata e garantire che il campo 'testo_integrale' Prisma scendesse a frontend senza troncature e in formato nativo.

DECISIONE:
Implementazione del metodo "Verifica Codice", navigazione via Tag funzionante e nuovo layout editoriale.
Il routing è stato aggiustato per mappare l'ID con 'await Promise.resolve(params)', prevenendo incompatibilità Next.js 15. Le Query Prisma sono state iniettate con operatore 'contains' insensibile alle maiuscole. Il layout è stato ripulito radicalmente, azzerando le card grigie pesanti e impostando uno sfondo standard 'bg-white relative' senza absolute. Centratura 'mx-auto' e 'max-w-[800px]' con py-20 per bypass headers. Inserito in priorità DOM il bottone 'Torna alla Dashboard'. Il caching di Next.js è stato abbattuto tramite export const dynamic = 'force-dynamic' garantendo l'iniezione live dei dati del verbale ad ogni apertura.`;

async function seedTodayVerbale() {
    console.log("Seeding / Updating Today's verbale (28/03)...");
    
    // Step 1: Wipe any corrupt/empty records from today to fulfill the user's hard reset request
    console.log("Cancellazione eventuali record corrotti del 28/03...");
    await prisma.floremoriaLog.deleteMany({
        where: { 
            sessionDate: { gte: new Date('2026-03-28T00:00:00.000Z') }
        }
    });

    // Step 2: Fresh injection
    const newLog = await prisma.floremoriaLog.create({
        data: {
            sessionDate: new Date('2026-03-28T18:00:00.000Z'),
            tag: 'BUGFIX, LAYOUT, ROUTING',
            topic: 'Re-Design Editoriale e Consolidamento Routing',
            shortSummary: 'Applicazione metodo Verifica Codice, eliminazione dark mode bloccanti e nuovo layout editoriale bianco per la Memoria Storica aziendale.',
            fullText: FULL_CONTENT,
            keyPrompt: 'Genera uno script Prisma unificato che purifichi e re-inietti completamente il verbale di oggi.'
        }
    });
    
    console.log(`Nuovo Verbale 28/03 CREATO DA ZERO con successo! (Nuovo ID Generato: ${newLog.id})\nTesto caricato: ${newLog.fullText?.substring(0, 30)}...`);
}

seedTodayVerbale()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
