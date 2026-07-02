import { loadEnvFiles } from '@/lib/loadEnvFiles';
import { cancelDashboardOrderByNumber } from '@/lib/orders/cancelOrder';

loadEnvFiles();

const orderNumber = process.argv[2]?.trim() || 'FT-MC-26-001';

async function main() {
    const result = await cancelDashboardOrderByNumber(orderNumber);
    if (!result) {
        console.error(`Ordine non trovato: ${orderNumber}`);
        process.exit(1);
    }
    console.log(`Ordine ${orderNumber} annullato (id=${result.id}).`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
