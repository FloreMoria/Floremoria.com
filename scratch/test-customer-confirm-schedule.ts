/**
 * Test scheduling Punto B + copy conferma cliente.
 * Esegui: npx tsx scratch/test-customer-confirm-schedule.ts
 */
import {
    computeCustomerConfirmSendAt,
    CUSTOMER_CONFIRM_DELAY_MS,
    italyWallTimeToUtc,
    nextItalyMorning0830,
} from '../lib/datetime/customerConfirmSchedule';
import {
    CUSTOMER_CONFIRM_CTA,
    CUSTOMER_ORDER_CONFIRM_BODY_CANONICAL,
    composeCustomerConfirmSlot3,
} from '../lib/vera/customerOrderConfirmCopy';
import { getItalyMinutesSinceMidnight } from '../lib/datetime/floristNotifyWindow';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(`FAIL: ${message}`);
    console.log(`OK: ${message}`);
}

function rome(hour: number, minute: number, day = 17): Date {
    return italyWallTimeToUtc({
        year: 2026,
        month: 7,
        day,
        hour,
        minute,
    });
}

function main(): void {
    assert(!CUSTOMER_CONFIRM_CTA.includes('🌹'), 'CTA senza rosa');
    assert(
        CUSTOMER_ORDER_CONFIRM_BODY_CANONICAL.includes('FloreMoria Staff 🌹'),
        'chiusura FloreMoria Staff'
    );
    assert(
        (CUSTOMER_ORDER_CONFIRM_BODY_CANONICAL.match(/🌹/g) || []).length === 1,
        'una sola rosa nel body canonico'
    );
    assert(!composeCustomerConfirmSlot3('Le invieremo la foto').includes('🌹'), 'slot3 senza rosa');

    const slotDefault = composeCustomerConfirmSlot3(null);
    assert(slotDefault.includes(CUSTOMER_CONFIRM_CTA), 'slot3 include CTA');
    assert(slotDefault.includes('posa appena completata'), 'slot3 frase completa default');
    assert(!/foto della\.\s/i.test(slotDefault), 'mai troncone foto della.');
    assert(slotDefault.length <= 92, 'slot3 entro limite Meta 92');

    const slotLong = composeCustomerConfirmSlot3(
        'Le invieremo la foto della posa appena completata con una dedica molto lunga che non entra.'
    );
    assert(slotLong.includes('posa appena completata'), 'lead troppo lungo → fallback completo');
    assert(!/foto della\.\s/i.test(slotLong), 'fallback senza troncone');

    const noon = rome(12, 0);
    const sendNoon = computeCustomerConfirmSendAt({ createdAt: noon, isTest: false });
    assert(
        sendNoon.getTime() === noon.getTime() + CUSTOMER_CONFIRM_DELAY_MS,
        '12:00 → +30 minuti'
    );

    const evening = rome(19, 0);
    const sendEvening = computeCustomerConfirmSendAt({ createdAt: evening, isTest: false });
    const expectedEvening = nextItalyMorning0830(evening);
    assert(sendEvening.getTime() === expectedEvening.getTime(), '19:00 → 08:30 mattina successiva');
    assert(getItalyMinutesSinceMidnight(sendEvening) === 8 * 60 + 30, 'target = 08:30 Italy');

    const lateNight = rome(2, 15);
    const sendNight = computeCustomerConfirmSendAt({ createdAt: lateNight, isTest: false });
    assert(getItalyMinutesSinceMidnight(sendNight) === 8 * 60 + 30, '02:15 → 08:30 stesso giorno');
    assert(sendNight.getTime() > lateNight.getTime(), '08:30 dopo le 02:15');

    const now = new Date();
    const sandbox = computeCustomerConfirmSendAt({
        createdAt: rome(22, 0),
        isTest: true,
        now,
    });
    assert(Math.abs(sandbox.getTime() - now.getTime()) < 50, 'sandbox → immediato');

    // Round-trip 08:30 Italy
    const wall = italyWallTimeToUtc({ year: 2026, month: 7, day: 18, hour: 8, minute: 30 });
    assert(getItalyMinutesSinceMidnight(wall) === 8 * 60 + 30, 'italyWallTimeToUtc 08:30');

    console.log('\nTutti i test Punto B schedule/copy OK.');
}

main();
