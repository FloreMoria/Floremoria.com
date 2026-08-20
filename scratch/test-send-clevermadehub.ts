import dotenv from 'dotenv';
import path from 'path';

// Load .env.local and .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import prisma from '../lib/prisma';
import { processAssistenzaInboundEmail } from '../lib/postman/processAssistenzaEmail';

async function main() {
  console.log('--- TEST RISPOSTA POSTMAN A clevermadehub.uk@gmail.com ---');
  console.log('GEMINI_API_KEY loaded:', Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY));
  console.log('RESEND_API_KEY loaded:', Boolean(process.env.RESEND_API_KEY));
  console.log('ASSISTENZA_EMAIL_USER:', process.env.ASSISTENZA_EMAIL_USER || '(mancante, si usa serverMail fallback)');

  const sampleEmail = {
    fromName: 'Clever Made',
    fromEmail: 'clevermadehub.uk@gmail.com',
    subject: '¡Aquí está Aduks Network!',
    text: `Hola, Mensaje rápido, ¡Aquí está Aduks Network! He rediseñado una versión mejorada de su sitio web después de analizarlo, ya que noté que es probable que los nuevos visitantes se vayan sin realizar ninguna acción...`,
    messageId: `<CAHFbETqvrCpnaa3gejTb5a1rwWLEWXfkh1rik3=1KRkpjJLPUw@mail.gmail.com>`,
  };

  console.log('\nInvocazione processAssistenzaInboundEmail con forceReProcess = true...');
  try {
    const result = await processAssistenzaInboundEmail(sampleEmail, null, { forceReProcess: true });
    console.log('✅ Risultato elaborazione Postman:', result);

    if (result.logId) {
      const updatedLog = await prisma.floremoriaLog.findUnique({
        where: { id: result.logId },
      });
      console.log('\n--- VERIFICA LOG AGGIORNATO NEL DB ---');
      console.log('ID:', updatedLog?.id);
      console.log('SessionDate:', updatedLog?.sessionDate);
      console.log('Tag:', updatedLog?.tag);
      console.log('Topic:', updatedLog?.topic);
      console.log('ShortSummary:', updatedLog?.shortSummary);
      console.log('AchievedResults:', updatedLog?.achievedResults);
      console.log('\nFullText:\n', updatedLog?.fullText);
    }
  } catch (err) {
    console.error('❌ Errore durante elaborazione Postman:', err);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
