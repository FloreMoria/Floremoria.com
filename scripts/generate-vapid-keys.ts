/**
 * Genera coppia chiavi VAPID per Web Push staff.
 * Uso: npx tsx scripts/generate-vapid-keys.ts
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('Aggiungi su Vercel Production (e .env.local per test):');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:assistenza@floremoria.com');
