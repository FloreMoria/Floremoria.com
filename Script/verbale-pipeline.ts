/**
 * Pipeline verbali BARBARA (Antigravity) + DEVIN (docs/) → Obsidian repo + dashboard.
 */
import { runVerbalePipeline, formatPipelineSummary } from '../lib/verbali/verbalePipeline';

const results = runVerbalePipeline();
if (results.length === 0) {
    console.log('Nessun verbale da sincronizzare.');
} else {
    console.log(formatPipelineSummary(results));
}
