import { loadEnvFiles } from '../lib/loadEnvFiles';
import { runMarketingProductionPipeline } from '../lib/marketing/engine/pipeline';

loadEnvFiles();

async function triggerPipeline() {
  console.log('🚀 AVVIO PIPELINE GENERAZIONE MARKETING...');
  try {
    const summary = await runMarketingProductionPipeline();
    console.log('\n📊 PIPELINE COMPLETATA!');
    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error('❌ Errore durante l\'esecuzione della pipeline:', err);
  }
}

triggerPipeline().catch(console.error);
