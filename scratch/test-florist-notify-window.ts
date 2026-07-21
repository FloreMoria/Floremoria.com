/**
 * Test unitario leggero: finestra notifiche fioristi 08:00–20:00 Europe/Rome.
 * Esegui: npx tsx scratch/test-florist-notify-window.ts
 */
import {
    FLORIST_NOTIFY_WINDOW_END_MINUTES,
    FLORIST_NOTIFY_WINDOW_START_MINUTES,
    getItalyMinutesSinceMidnight,
    isWithinFloristNotifyWindow,
} from '../lib/datetime/floristNotifyWindow';
import { shouldNotifyFloristOnPartnerAssignment } from '../lib/orders/floristDeliveryLinkRules';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(`FAIL: ${message}`);
    console.log(`OK: ${message}`);
}

/** Costruisce un Date che in Europe/Rome corrisponde a hour:minute del giorno di riferimento. */
function romeLocalAsUtcProxy(hour: number, minute: number): Date {
    // Usa una data fissa e regola finché i minuti Italia coincidono.
    const probe = new Date(Date.UTC(2026, 6, 17, hour - 2, minute, 0)); // CEST = UTC+2 in luglio
    const italy = getItalyMinutesSinceMidnight(probe);
    const target = hour * 60 + minute;
    const delta = target - italy;
    return new Date(probe.getTime() + delta * 60_000);
}

function main(): void {
    assert(FLORIST_NOTIFY_WINDOW_START_MINUTES === 8 * 60, 'start = 08:00');
    assert(FLORIST_NOTIFY_WINDOW_END_MINUTES === 20 * 60, 'end = 20:00');

    assert(isWithinFloristNotifyWindow(romeLocalAsUtcProxy(8, 0)), '08:00 dentro');
    assert(isWithinFloristNotifyWindow(romeLocalAsUtcProxy(12, 0)), '12:00 dentro');
    assert(isWithinFloristNotifyWindow(romeLocalAsUtcProxy(20, 0)), '20:00 dentro');
    assert(!isWithinFloristNotifyWindow(romeLocalAsUtcProxy(20, 1)), '20:01 fuori');
    assert(!isWithinFloristNotifyWindow(romeLocalAsUtcProxy(7, 59)), '07:59 fuori');
    assert(!isWithinFloristNotifyWindow(romeLocalAsUtcProxy(23, 0)), '23:00 fuori');

    assert(
        shouldNotifyFloristOnPartnerAssignment(null, 'partner-1'),
        'assegnazione da null → notifica'
    );
    assert(
        shouldNotifyFloristOnPartnerAssignment('a', 'b'),
        'cambio fiorista → notifica'
    );
    assert(
        !shouldNotifyFloristOnPartnerAssignment('a', 'a'),
        'stesso fiorista → no notifica'
    );
    assert(
        !shouldNotifyFloristOnPartnerAssignment('a', null),
        'rimozione fiorista → no notifica'
    );

    console.log('\nTutti i test finestra/assegnazione OK.');
}

main();
