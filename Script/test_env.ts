import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const key = process.env.RESEND_API_KEY || '';
console.log('--- DEBUG ENV KEY ---');
console.log('Chiave caricata:', JSON.stringify(key));
console.log('Lunghezza della chiave:', key.length);

console.log('Codici dei caratteri della chiave:');
for (let i = 0; i < key.length; i++) {
    console.log(`Carattere ${i}: "${key[i]}" (codice: ${key.charCodeAt(i)})`);
}
