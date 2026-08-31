import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { findNearbyFloristsForCemetery } from '../lib/ai/floristScout';

async function main() {
  const r = await findNearbyFloristsForCemetery({
    cemeteryName: 'Campo di civo',
    city: 'Sondrio',
    address: null,
  });
  console.log(JSON.stringify(r, null, 2));
}

main().catch(console.error);
