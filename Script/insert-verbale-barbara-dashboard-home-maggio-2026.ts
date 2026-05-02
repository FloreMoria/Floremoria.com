import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carica .env poi .env.local (come Next.js), così DATABASE_URL non deve stare solo in .env.
 */
function loadEnvFiles(): void {
  for (const name of ['.env', '.env.local']) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

function printDbHelp(err: unknown): void {
  const msg = String(err);
  if (!msg.includes("Can't reach database") && !msg.includes('P1001')) return;
  console.error(`
Impossibile connettersi al database (DATABASE_URL).

Cosa fare:
1) Avvia PostgreSQL in locale (es. Postgres.app, oppure Docker):
   docker run --name floremoria-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=floremoria -p 5432:5432 -d postgres:16

2) In .env oppure .env.local imposta una URL valida, esempio:
   DATABASE_URL="postgresql://postgres:dev@localhost:5432/floremoria?schema=public"

3) Applica le migrazioni se il DB è nuovo:
   npx prisma migrate dev

4) Rilancia:
   npm run log:verbale-barbara-home
`);
}

/**
 * Verbale redatto in stile BARBARA (Legal & Compliance, .cursorrules)
 * per tracciare in Dashboard gli interventi sulla home pubblica.
 *
 * Esecuzione: npm run log:verbale-barbara-home
 */
async function main(): Promise<void> {
  loadEnvFiles();

  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      'Manca DATABASE_URL. Aggiungila in .env o .env.local (vedi messaggio sopra per esempio).'
    );
    process.exit(1);
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const verbaleTesto = `
VERBALE DI CONSOLIDAMENTO — Home FloreMoria (sessione maggio 2026)

1) PREMESSA E AMBITO
Il presente verbale documenta gli adeguamenti alla pagina pubblica principale (/) al fine di garantire coerenza tra promessa commerciale, catalogo reale e percezione utente, con attenzione alla trasparenza informativa e alla riduzione di ambiguità su servizi accessori rispetto agli omaggi floreali principali.

2) STRUTTURA ED ESPERIENZA UTENTE
- Riordino delle sezioni secondo funnel approvato: Hero, ricerca comuni, percorsi di servizio, come funziona, foto di conferma (con evidenza esplicita della gratuità dello scatto post-consegna ove applicabile), recensioni, valori.
- Banner di fiducia (TrustBar) riposto in prossimità della ricerca per separare chiaramente la fase emotiva (hero) dalla fase operativa (inserimento comune).

3) CATEGORIE E RAPPRESENTAZIONE VISIVA
- Introdotta sezione "Tre modi per accompagnarti" con tre card verticali (rapporto 3:4) collegate a: fiori sulle tombe, fiori per il funerale, fiori per i piccoli amici.
- Le immagini delle card sono selezionate esclusivamente tra bouquet/composizioni della categoria merceologica corrispondente; esclusi accessori (lumini, messaggi, nastri, ecc.) dalla rotazione casuale, per evitare disallineamento tra immagine e servizio offerto.
- Corretto il mapping filesystem per la cartella reale "Fiori-per-Funerale" (precedente mismatch con path errato), eliminando il rischio di fallback visivi fuori contesto.

4) RESILIENZA TECNICA E DATI
- Gestione non bloccante del database in assenza di Postgres locale per la home (carousel prove fotografiche).
- Sanificazione URL immagini vuote nel carousel.
- Manifest immagini rigenerato in pipeline di build/dev.

5) RISERVA
Si raccomanda di mantenere allineati copy legali/condizioni di servizio e privacy ove si menzionano WhatsApp e servizio fotografico, e di verificare periodicamente che le rotazioni immagine non includano mai asset classificati come accessorio nella UI promozionale delle tre porte.

— Redatto per inserimento in LOG operativo Dashboard (FloremoriaLog).
`.trim();

  const topic =
    'Verbale — Home pubblica: Tre percorsi, asset immagini funerale, UX ricerca e conformità offerta';

  console.log('Inserimento verbale Barbara (Dashboard LOG)...');

  try {
    await prisma.floremoriaLog.create({
      data: {
        sessionDate: new Date(),
        tag: '#BARBARA_LEGAL',
        topic,
        shortSummary:
          'Verbale su aggiornamento home: sezioni, card 3:4 per categoria, esclusione accessori da hero, fix path Fiori-per-Funerale, resilienza DB e copy trasparenza foto.',
        keyPrompt: 'BARBARA — Verbale post-sessione home / Tre modi / LOG Dashboard',
        fullText: verbaleTesto,
        discussedPoints:
          'Allineamento immagini alle categorie merceologiche; prevenzione mismatch lumino/accessori su card funerale; posizionamento TrustBar; testi foto di conferma.',
        achievedResults:
          'Mapping getImages corretto per Fiori-per-Funerale; pickRandomTrePorteHero con whitelist; TrePorteCard aspect 3:4; fallback categoria-specifici; loadDeliveryProofPhotos non bloccante.',
        pendingTasks:
          'Verifica copy legali su pagine statiche correlate; rotazione chiavi Stripe di test se esposte in passato in ambienti non produttivi.',
        criticalAlarms: null,
      },
    });
  } catch (e) {
    printDbHelp(e);
    throw e;
  } finally {
    await prisma.$disconnect();
  }

  console.log('Verbale inserito in floremoria_logs (Dashboard → Log).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
