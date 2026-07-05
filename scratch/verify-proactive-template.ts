import {
    extractFirstName,
    formatGentileSalutation,
    normalizeOrderCode,
    resolveProactiveTemplateParams,
} from '../lib/whatsapp/proactiveTemplateParams';
import {
    buildTemplateBodyParameters,
    PROACTIVE_CONVERSATION_BODY_TEMPLATE_CANONICAL,
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
if (resolved.salutationParam !== 'Gentile Carlo') failed++;
if (resolved.orderCode !== 'FF-PN-26-004') failed++;

const params = buildTemplateBodyParameters([
    resolved.salutationParam,
    resolved.orderCode,
    resolved.staffNotes,
]);
console.log('Meta body params:', JSON.stringify(params, null, 2));
if (params[0].text !== 'Gentile Carlo') failed++;

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
if (!preview.includes('ordine identificato come FF-PN-26-004')) failed++;
if (!preview.includes('Testo libero staff')) failed++;

const logged = renderProactiveTemplateMessage('Carlo', 'FF-PN-26-004', 'Testo libero staff');
if (logged !== preview) failed++;

console.log(failed ? `FAILED ${failed} checks` : 'ALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
