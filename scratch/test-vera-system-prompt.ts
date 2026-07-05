/**
 * Test modulo lib/vera — isolamento contesto e struttura prompt.
 * Uso: npx tsx scratch/test-vera-system-prompt.ts
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

import type { ChatSession } from '../lib/chatStore';
import {
    buildVeraKnowledgeContext,
    buildVeraWhatsAppSystemInstruction,
    CONTEXT_ISOLATION_RULES,
    resolveVeraCallerContext,
} from '../lib/vera';

function mockSession(overrides: Partial<ChatSession> = {}): ChatSession {
    return {
        phone: 'whatsapp:+393331112222',
        name: 'Salvatore Marsiglione',
        userType: 'UTENTE',
        status: 'AI_ACTIVE',
        lastMessage: 'Vorrei informazioni per un omaggio',
        date: 'oggi',
        time: '12:00',
        initials: 'SM',
        messages: [],
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

let failed = 0;

function assertContains(label: string, haystack: string, needle: string) {
    if (!haystack.includes(needle)) {
        console.error('FAIL', label, '— manca:', needle);
        failed++;
    } else {
        console.log('OK', label);
    }
}

function assertNotContains(label: string, haystack: string, needle: string) {
    if (haystack.includes(needle)) {
        console.error('FAIL', label, '— non doveva contenere:', needle);
        failed++;
    } else {
        console.log('OK', label);
    }
}

(async () => {
    const session = mockSession();
    const ctx = await resolveVeraCallerContext(session);
    const knowledge = buildVeraKnowledgeContext('UTENTE');
    const prompt = buildVeraWhatsAppSystemInstruction(ctx, 'UTENTE', knowledge);

    console.log('--- Caller context ---');
    console.log('mode:', ctx.mode, 'hasActiveOrder:', ctx.hasActiveOrder);

    assertContains('isolamento regole', prompt, CONTEXT_ISOLATION_RULES.slice(0, 40));
    assertContains('pre-acquisto mode', prompt, 'PRE-ACQUISTO');
    assertContains('metodo floremoria', prompt, 'METODO FLOREMORIA');
    assertContains('esempio luciano pagamento', prompt, 'PayPal');
    assertContains('disambiguazione galleria', prompt, 'ZONA del cimitero');
    assertNotContains('no archivio grezzo cap1', knowledge, 'Mammí Luciano');
    assertNotContains('no ceo in kb slice', knowledge, 'Salvatore Marsiglione');
    assertContains('contesto telefono', prompt, '+393331112222');

    if (ctx.mode === 'pre_acquisto') {
        assertContains('vietato inventare ordini', prompt, 'VIETATO citare codici ordine');
    }

    console.log(failed ? `\nFAILED ${failed}` : '\nALL CHECKS PASSED');
    process.exit(failed ? 1 : 0);
})();
