import crypto from 'crypto';
import {
    generateMagicPhotoDeliveryToken,
    verifyMagicPhotoDeliveryToken,
    buildMagicPhotoDeliveryUrl,
} from '../lib/auth/magicPhotoDelivery';

// Mock del vecchio generatore di token per verificare la retrocompatibilità
function oldGenerateToken(orderId: string, secret: string, exp: number): string {
    const payload = {
        orderId: orderId.trim(),
        exp,
    };
    const payloadStr = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
    const envelope = { p: payloadStr, s: signature };
    return Buffer.from(JSON.stringify(envelope)).toString('base64url');
}

function runTests() {
    console.log('--- TEST MAGIC PHOTO COMPACT TOKEN ---');

    const orderId = 'cmrvxwavz0001l204q38y9el';
    const secret = process.env.MAGIC_LINK_SECRET || 'default-fallback-magic-link-secret-floremoria-2026';

    // Test 1: Generazione e lunghezza token compatto
    const compactToken = generateMagicPhotoDeliveryToken(orderId);
    console.log('Token compatto generato:', compactToken);
    console.log('Lunghezza token compatto:', compactToken.length, 'caratteri (rispetto a ~192)');
    console.log('Test 1 (Lunghezza < 60):', compactToken.length < 60 ? 'PASSED ✓' : 'FAILED ✗');

    // Test 2: Verifica corretta decodifica token compatto valido
    const verified = verifyMagicPhotoDeliveryToken(compactToken);
    console.log('Test 2 (Verifica valido):', verified && 'orderId' in verified && verified.orderId === orderId ? 'PASSED ✓' : 'FAILED ✗');

    // Test 3: Verifica fallimento con firma manomessa
    const tamperedToken = compactToken.slice(0, -2) + 'XX';
    const verifiedTampered = verifyMagicPhotoDeliveryToken(tamperedToken);
    console.log('Test 3 (Firma non valida):', verifiedTampered === null ? 'PASSED ✓' : 'FAILED ✗');

    // Test 4: Retrocompatibilità con vecchio token JSON
    const oldToken = oldGenerateToken(orderId, secret, Date.now() + 24 * 60 * 60 * 1000);
    const verifiedOld = verifyMagicPhotoDeliveryToken(oldToken);
    console.log('Test 4 (Retrocompatibilità vecchio valido):', verifiedOld && 'orderId' in verifiedOld && verifiedOld.orderId === orderId ? 'PASSED ✓' : 'FAILED ✗');

    // Test 5: Scadenza vecchio token
    const oldExpiredToken = oldGenerateToken(orderId, secret, Date.now() - 1000);
    const verifiedOldExpired = verifyMagicPhotoDeliveryToken(oldExpiredToken);
    console.log('Test 5 (Scadenza vecchio):', verifiedOldExpired && 'expired' in verifiedOldExpired ? 'PASSED ✓' : 'FAILED ✗');

    // Test 6: URL generato
    const url = buildMagicPhotoDeliveryUrl(orderId);
    console.log('URL completo:', url);
    console.log('Test 6 (URL valido):', url.startsWith('http') && url.includes('token=') ? 'PASSED ✓' : 'FAILED ✗');

    console.log('--- ALL TESTS COMPLETED ---');
}

runTests();
