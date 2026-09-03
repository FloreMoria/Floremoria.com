/**
 * Verifica helper template Meta floremoria_generico.
 * Esegui: npx tsx scripts/verify-floremoria-generico-template.ts
 */

import {
    FLOREMORIA_GENERICO_BODY_CANONICAL,
    getFloremoriaGenericoWhatsAppTemplate,
    prepareGenericoUpdateBody,
    renderFloremoriaGenericoPreview,
    resolveGenericoRecipientName,
} from '@/lib/whatsapp/floremoriaGenericoTemplate';
import { getVeraTemplate } from '@/lib/whatsapp/veraTemplateRegistry';

function assert(cond: unknown, msg: string): void {
    if (!cond) throw new Error(msg);
}

function main(): void {
    const spec = getVeraTemplate('floremoria_generico');
    assert(spec.metaName === 'floremoria_generico', 'metaName registry');
    assert(spec.bodyParamCount === 2, '2 body params');
    assert(spec.bodySlots[0] === 'recipientFirstName', 'slot1');
    assert(spec.bodySlots[1] === 'updateMessage', 'slot2');

    const dash = getFloremoriaGenericoWhatsAppTemplate('UTENTE');
    assert(dash.fields.length === 2, 'dashboard fields');
    assert(dash.bodyTemplate === FLOREMORIA_GENERICO_BODY_CANONICAL, 'canonical body');

    const cleaned = prepareGenericoUpdateBody(
        'Gentile Mario, la consegna è confermata per domani alle 10:00. Rimaniamo a disposizione. FloreMoria Staff'
    );
    assert(!/^gentile/i.test(cleaned), 'strip greeting');
    assert(!/rimaniamo a disposizione/i.test(cleaned), 'strip closing');
    assert(cleaned.includes('consegna'), 'keep core message');

    const preview = renderFloremoriaGenericoPreview('Luciano', cleaned);
    assert(preview.startsWith('Gentile Luciano'), 'preview opening');
    assert(preview.includes(cleaned), 'preview body param');

    assert(resolveGenericoRecipientName('') === 'Cliente', 'default name');
    assert(resolveGenericoRecipientName('Maria Rossi') === 'Maria', 'first name');

    console.log('OK floremoria_generico template helpers');
}

main();
