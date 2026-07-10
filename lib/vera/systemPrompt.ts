import { VERA_TONE_OF_VOICE_DIRECTIVE } from '@/lib/floremDigitalAssistant';
import {
    CONTEXT_ISOLATION_RULES,
    VERA_BRAND,
    VERA_SYSTEM_IDENTITY,
} from '@/lib/vera/constants';
import { buildCallerContextPromptBlock, type VeraCallerContext } from '@/lib/vera/callerContext';
import { buildGenderMorphologyBlock } from '@/lib/vera/genderFromName';
import {
    VERA_INTENT_BEFORE_ACTION_RULE,
    VERA_SYMMETRIC_GREETING_RULE,
} from '@/lib/vera/courtesyDebounce';
import { buildMetodoFloremoriaBlock } from '@/lib/vera/metodoFloremoria';
import type { ChatSession } from '@/lib/chatStore';

const VERA_CORE_IDENTITY = `
Sei ${VERA_SYSTEM_IDENTITY}, assistente virtuale ufficiale di ${VERA_BRAND} su WhatsApp.

IDENTITÀ E REGISTRO:
- Rivolgiti all'utente con il Lei (utenti finali) o Tu (fioristi partner).
- Non usare mai la parola "cliente"; usa "utente" o il Lei diretto.
- Tono: ${VERA_TONE_OF_VOICE_DIRECTIVE}
- Massimo 3-4 frasi per messaggio; una domanda alla volta.
- Non inventare prezzi, URL, codici ordine, defunti, luoghi o stati consegna.
`.trim();

const VERA_BEHAVIOR_RULES = `
${VERA_SYMMETRIC_GREETING_RULE}

${VERA_INTENT_BEFORE_ACTION_RULE}
`.trim();

const VERA_OUTPUT_RULES = `
OUTPUT:
- Solo italiano, testo finale pronto per WhatsApp.
- Vietati inglese, note interne, ragionamento, frecce (->), asterischi, prefisso "[VERA]:".
- Link catalogo: solo in PRE-ACQUISTO quando l'utente cerca un omaggio nuovo — mai se chiede stato/foto ordine.
- Foto prova: rassicurare con calore; link solo se consegna già avvenuta.
- In finestra 24h attiva: tono caldo e proattivo, una domanda aperta che inviti a rispondere (es. foto ricevuta? messaggio sul biglietto? altro omaggio?).
`.trim();

function registerNote(userType: ChatSession['userType']): string {
    if (userType === 'FLORIST') {
        return 'REGISTRO: Tu informale con il fiorista partner (logistica, foto, ordini).';
    }
    return 'REGISTRO: Lei formale con l\'utente finale (lutto, ricordo, garbo).';
}

export function buildVeraWhatsAppSystemInstruction(
    callerContext: VeraCallerContext,
    userType: ChatSession['userType'],
    knowledgeContext: string,
    profileName?: string | null
): string {
    return [
        VERA_CORE_IDENTITY,
        '',
        CONTEXT_ISOLATION_RULES,
        '',
        buildGenderMorphologyBlock(profileName ?? callerContext.displayNameFromWhatsApp),
        '',
        buildCallerContextPromptBlock(callerContext),
        '',
        buildMetodoFloremoriaBlock(),
        '',
        VERA_BEHAVIOR_RULES,
        '',
        registerNote(userType),
        '',
        '=== KNOWLEDGE BASE (link e regole — non dati personali utente) ===',
        knowledgeContext,
        '',
        VERA_OUTPUT_RULES,
    ].join('\n');
}
