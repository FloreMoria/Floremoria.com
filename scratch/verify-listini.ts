import { calculateFloristCompensation } from '../lib/pricing/calculateFloristCompensation';
import { resolveListinoEntry } from '../lib/pricing/listini';

const lines = [
    { slug: 'cuore-corona', name: 'Cuore / Corona', qty: 1 },
    { slug: 'lumino', name: 'Lumino', qty: 2 },
    { slug: 'bouquet-tributo-eterno', name: 'Tributo Eterno', qty: 1 },
];

let failed = 0;
for (const line of lines) {
    const entry = resolveListinoEntry(line.slug, line.name);
    if (!entry) {
        console.error('FAIL resolve', line.name);
        failed++;
    } else {
        console.log('OK', line.name, entry.floristCents / 100, 'EUR');
    }
}

const total = calculateFloristCompensation(
    lines.map((l) => ({
        quantity: l.qty,
        product: { slug: l.slug, name: l.name },
    }))
);
console.log('Total florist:', total.totalLabel, '(expected 115+4+30=149€)');
if (total.totalCents !== 14900) failed++;

console.log(failed ? `FAILED ${failed}` : 'ALL LISTINO CHECKS PASSED');
process.exit(failed ? 1 : 0);
