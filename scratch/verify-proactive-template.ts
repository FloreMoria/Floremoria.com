import {
    extractFirstName,
    formatGentileSalutation,
    normalizeOrderCode,
    resolveProactiveTemplateParams,
} from '../lib/whatsapp/proactiveTemplateParams';
import {
    buildProactiveTemplateComponents,
    PROACTIVE_CONVERSATION_BODY_TEMPLATE_CANONICAL,
    PROACTIVE_TEMPLATE_BODY_PARAM_COUNT,
    PROACTIVE_TEMPLATE_HEADER_TEXT_PARAM_COUNT,
    renderProactiveTemplateBody,
    renderProactiveTemplateMessage,
} from '../lib/whatsapp/approvedTemplates';

const tests: [string, string, string][] = [
    ['extractFirstName fiorista', extractFirstName('Carlo Rossi'), 'Carlo'],
    ['extractFirstName con Gentile', extractFirstName('Gentile Carlo'), 'Carlo'],
    ['formatGentileSalutation', formatGentileSalutation('Carlo'), 'Gentile Carlo'],
    ['normalizeOrderCode pulito', normalizeOrderCode('FF-PN-26-004'), 'FF-PN-26-004'],
    ['normalizeOrderCode prefisso', normalizeOrderCode('Ordine FF-PN-26-004'), 'FF-PN-26-004'],
];

let failed = 0;
for (const [name, got, want] of tests) {
    if (got !== want) {
        console.error('FAIL', name, 'got', got, 'want', want);
        failed++;
    } else {
        console.log('OK', name);
    }
}

const resolved = resolveProactiveTemplateParams({
    recipientFirstName: 'Carlo Rossi',
    orderCode: 'Ordine FF-PN-26-004',
    staffNotes: '  Buongiorno, confermiamo la consegna.  ',
});
console.log('resolve:', resolved);
if (resolved.nameParam !== 'Carlo') failed++;
if (resolved.orderCode !== 'FF-PN-26-004') failed++;

const components = buildProactiveTemplateComponents({
    recipientFirstName: resolved.nameParam,
    orderCode: resolved.orderCode,
    staffNotes: resolved.staffNotes,
});
console.log('Meta components:', JSON.stringify(components, null, 2));

const header = components.find((c) => c.type === 'header');
const body = components.find((c) => c.type === 'body');
if ((header?.parameters?.length ?? 0) !== PROACTIVE_TEMPLATE_HEADER_TEXT_PARAM_COUNT) failed++;
if ((body?.parameters?.length ?? 0) !== PROACTIVE_TEMPLATE_BODY_PARAM_COUNT) failed++;
if (header?.parameters?.[0]?.type === 'text' && header.parameters[0].text !== 'FF-PN-26-004') failed++;
if (body?.parameters?.[0]?.type === 'text' && body.parameters[0].text !== 'Carlo') failed++;
if (body?.parameters?.[1]?.type === 'text' && !body.parameters[1].text.includes('Buongiorno')) failed++;

const preview = renderProactiveTemplateBody(
    PROACTIVE_CONVERSATION_BODY_TEMPLATE_CANONICAL,
    'Carlo',
    'FF-PN-26-004',
    'Testo libero staff'
);
console.log('--- ANTEPRIMA DESTINATARIO ---');
console.log(preview);
console.log('--- FINE ANTEPRIMA ---');

if (!preview.startsWith('Gentile Carlo,')) failed++;
if (!preview.includes('Testo libero staff')) failed++;

const logged = renderProactiveTemplateMessage('Carlo', 'FF-PN-26-004', 'Testo libero staff');
if (!logged.includes('Ordine FF-PN-26-004')) failed++;
if (!logged.includes('Gentile Carlo,')) failed++;

console.log(failed ? `FAILED ${failed} checks` : 'ALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
