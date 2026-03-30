import prisma from './lib/prisma';

async function showLog7() {
    console.log("Connessione al Database per estrarre ID 7...\n");
    const log = await prisma.floremoriaLog.findUnique({
        where: { id: 7 }
    });

    if (log && log.fullText) {
        console.log("=========== CONTENUTO INTEGRALE (ID 7) ===========");
        console.log(log.fullText);
        console.log("==================================================");
    } else {
        console.log("ERRORE: Impossibile trovare il testo per l'ID 7.");
    }
}

showLog7()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
