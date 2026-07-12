import { GoogleGenAI } from '@google/genai';
import { CampaignStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { MarketingEngineConfigError } from './generation';

export interface GuardianReport {
  passed: boolean;
  feedback: string;
}

export interface GuardiansCheckpointReports {
  alma: GuardianReport;
  sofia: GuardianReport;
  martina: GuardianReport;
  barbara: GuardianReport;
  prof: GuardianReport;
}

export interface GuardiansCheckpointResult {
  approved: boolean;
  reason?: string;
  reports?: GuardiansCheckpointReports;
}

interface GeminiGuardianReport {
  passed?: boolean;
  feedback?: string;
}

interface GeminiCheckpointPayload {
  approved?: boolean;
  rejectionReason?: string;
  reports?: {
    alma?: GeminiGuardianReport;
    sofia?: GeminiGuardianReport;
    martina?: GeminiGuardianReport;
    barbara?: GeminiGuardianReport;
    prof?: GeminiGuardianReport;
  };
}

const GUARDIANS_CHECKPOINT_SYSTEM_PROMPT = `
Tu sei il Comitato di Controllo e Compliance di FloreMoria. Devi scansionare una bozza social e analizzarla contemporaneamente attraverso 5 lenti specializzate:

1. ALMA: Verifica che l'impatto psicologico sia empatico. Respingi categoricamente leve di urgenza, clickbait o marketing aggressivo sul lutto.
2. SOFIA: Garantisci la massima dignità morale ed etica del messaggio.
3. MARTINA: Controlla la verità botanica. Se il testo o il prompt d'immagine menzionano fiori invernali in una campagna estiva (o viceversa), segnalalo come errore.
4. BARBARA: Verifica che non ci siano violazioni legali o ambiguità di prezzo.
5. PROF: Caccia ogni refuso ortografico o grammaticale.

Se lo stato "approved" è false, devi obbligatoriamente fornire nel campo "rejectionReason" le indicazioni correttive precise che i generatori di copy ed immagini dovranno seguire per correggere i problemi riscontrati. Ad esempio: "MARTINA ha rifiutato: il bouquet contiene tulipani ma siamo a luglio. INDICAZIONI DI CORREZIONE: Sostituire i tulipani con rose o girasoli estivi nel copy e nel prompt d'immagine."

Devi restituire un JSON con questa struttura esatta:
{
  "approved": boolean,
  "rejectionReason": "Stringa dettagliata se approved è false, indicando quale agente ha rifiutato, perché, e fornendo INDICAZIONI DI CORREZIONE precise",
  "reports": {
    "alma": { "passed": boolean, "feedback": "..." },
    "sofia": { "passed": boolean, "feedback": "..." },
    "martina": { "passed": boolean, "feedback": "..." },
    "barbara": { "passed": boolean, "feedback": "..." },
    "prof": { "passed": boolean, "feedback": "..." }
  }
}
`;

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function normalizeGuardianReport(value: GeminiGuardianReport | undefined): GuardianReport {
  return {
    passed: value?.passed === true,
    feedback: String(value?.feedback || '').trim() || 'Nessun feedback fornito.',
  };
}

function parseCheckpointPayload(rawText: string): {
  approved: boolean;
  rejectionReason: string;
  reports: GuardiansCheckpointReports;
} {
  let parsed: GeminiCheckpointPayload;
  try {
    parsed = JSON.parse(stripJsonFences(rawText)) as GeminiCheckpointPayload;
  } catch {
    throw new Error('Risposta Gemini non in formato JSON valido.');
  }

  const reports: GuardiansCheckpointReports = {
    alma: normalizeGuardianReport(parsed.reports?.alma),
    sofia: normalizeGuardianReport(parsed.reports?.sofia),
    martina: normalizeGuardianReport(parsed.reports?.martina),
    barbara: normalizeGuardianReport(parsed.reports?.barbara),
    prof: normalizeGuardianReport(parsed.reports?.prof),
  };

  const allPassed = Object.values(reports).every((report) => report.passed);
  const approved = parsed.approved === true && allPassed;

  let rejectionReason = String(parsed.rejectionReason || '').trim();
  if (!approved && !rejectionReason) {
    const failed = Object.entries(reports)
      .filter(([, report]) => !report.passed)
      .map(([name, report]) => `${name.toUpperCase()}: ${report.feedback}`)
      .join(' | ');
    rejectionReason = failed || 'Checkpoint rifiutato da uno o più Guardiani.';
  }

  return { approved, rejectionReason, reports };
}

function buildCheckpointUserContent(campaign: {
  id: string;
  category: string;
  targetChannel: string;
  copy: string;
  imagePrompt: string;
  hashtags: string[];
  imageUrl: string;
}): string {
  const today = new Date();
  const seasonContext = today.toLocaleDateString('it-IT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Rome',
  });

  return [
    'Valuta la seguente bozza di campagna marketing prima della pubblicazione.',
    '',
    `Data di valutazione (Italia): ${seasonContext}`,
    `Campaign ID: ${campaign.id}`,
    `Categoria: ${campaign.category}`,
    `Canale: ${campaign.targetChannel}`,
    `Hashtag: ${campaign.hashtags.map((tag) => `#${tag.replace(/^#+/, '')}`).join(', ') || '(nessuno)'}`,
    `Immagine generata: ${campaign.imageUrl?.trim() ? 'sì (URL presente)' : 'no (mancante)'}`,
    '',
    '--- COPY ---',
    campaign.copy,
    '',
    '--- IMAGE PROMPT ---',
    campaign.imagePrompt?.trim() || '(prompt immagine non fornito — valuta il copy e segnala eventuali rischi botanici impliciti)',
  ].join('\n');
}

/**
 * Esegue il checkpoint dei 5 Guardiani (ALMA, SOFIA, MARTINA, BARBARA, PROF)
 * e aggiorna lo stato Prisma in APPROVED o REJECTED.
 */
export async function evaluateCampaignDraft(
  campaignId: string
): Promise<GuardiansCheckpointResult> {
  console.log(`[Marketing Checkpoint] Valutazione campagna ${campaignId}`);

  const campaign = await prisma.marketingCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new Error(`Campagna ${campaignId} non trovata.`);
  }

  if (campaign.status === CampaignStatus.APPROVED || campaign.status === CampaignStatus.PUBLISHED) {
    return { approved: true };
  }

  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new MarketingEngineConfigError(
      'GEMINI_API_KEY non configurata: impossibile eseguire il checkpoint.'
    );
  }

  const model =
    process.env.MARKETING_CHECKPOINT_GEMINI_MODEL?.trim() ||
    process.env.FUTURIA_CHECKPOINT_GEMINI_MODEL?.trim() ||
    'gemini-2.5-pro';
  const ai = new GoogleGenAI({ apiKey });

  let rawText: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: buildCheckpointUserContent(campaign),
      config: {
        systemInstruction: GUARDIANS_CHECKPOINT_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });
    rawText = response.text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Errore chiamata Gemini (checkpoint): ${msg}`);
  }

  if (!rawText?.trim()) {
    throw new Error('Risposta Gemini vuota durante il checkpoint.');
  }

  const { approved, rejectionReason, reports } = parseCheckpointPayload(rawText);

  if (approved) {
    await prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.APPROVED,
        rejectionReason: null,
      },
    });

    console.log(`[Marketing Checkpoint] Campagna ${campaignId} APPROVED`);
    return { approved: true, reports };
  }

  await prisma.marketingCampaign.update({
    where: { id: campaignId },
    data: {
      status: CampaignStatus.REJECTED,
      rejectionReason,
    },
  });

  const failedGuardians = Object.entries(reports)
    .filter(([, report]) => !report.passed)
    .map(([name]) => name.toUpperCase())
    .join(', ');

  console.log(
    `[Marketing Checkpoint] Campagna ${campaignId} REJECTED — Guardiani in dissenso: ${failedGuardians || 'N/D'}`
  );

  return { approved: false, reason: rejectionReason, reports };
}
