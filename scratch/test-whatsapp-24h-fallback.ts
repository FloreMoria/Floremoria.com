import { is24HourWindowError, extractOrderCodeFromText } from '../lib/whatsapp/sendWhatsAppMessage';

function runTests() {
    console.log('--- TEST VERIFICA FALLBACK WHATSAPP 24H FINESTRA CHIUSA ---');

    // Test 1: Riconoscimento Meta Error 131047
    const metaErrorRes = {
        ok: false,
        error: 'Message failed to send because more than 24 hours have passed since the customer last replied to this number.',
        errorCode: 131047,
    };
    const test1 = is24HourWindowError(metaErrorRes);
    console.log('Test 1 (Meta Error 131047):', test1 === true ? 'PASSED ✓' : 'FAILED ✗');

    // Test 2: Riconoscimento Twilio / Meta Subcode 470 / 21610
    const twilioErrorRes = {
        ok: false,
        error: 'Session expired / Outside 24-hour window',
        errorSubcode: 470,
    };
    const test2 = is24HourWindowError(twilioErrorRes);
    console.log('Test 2 (Twilio Error 470):', test2 === true ? 'PASSED ✓' : 'FAILED ✗');

    // Test 3: Riconoscimento errore generico diverso (es. invalid phone)
    const otherErrorRes = {
        ok: false,
        error: 'Invalid recipient phone number',
        errorCode: 100,
    };
    const test3 = is24HourWindowError(otherErrorRes);
    console.log('Test 3 (Errore non-24h):', test3 === false ? 'PASSED ✓' : 'FAILED ✗');

    // Test 4: Estrazione Codice Ordine dal testo
    const orderCodeText = 'Gentile cliente, aggiornamento sull\'ordine FF-PN-26-004 in consegna.';
    const extractedCode = extractOrderCodeFromText(orderCodeText);
    console.log('Test 4 (Estrazione codice ordine):', extractedCode === 'FF-PN-26-004' ? 'PASSED ✓' : `FAILED ✗ (${extractedCode})`);

    console.log('--- ALL TESTS COMPLETED ---');
}

runTests();
