// Using global fetch from Node 18+

const apiKey = 'pit-c59d9968-e2b2-4523-9cf2-6d9df7ecf018';
const locationId = '7cjy5uPfkHMJtu7PZy9C';

async function testEndpoints() {
    // Proviamo le varie combinazioni di rotte per i template in GHL v2
    const urls = [
        `https://services.leadconnectorhq.com/locations/${locationId}/templates`,
        `https://services.leadconnectorhq.com/templates?locationId=${locationId}`,
        `https://services.leadconnectorhq.com/whatsapp/templates?locationId=${locationId}`,
    ];

    for (const url of urls) {
        console.log(`Trying URL: ${url}`);
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json',
                    'Version': '2021-04-15' // Versione API standard di GHL
                }
            });
            console.log(`Status: ${res.status}`);
            const text = await res.text();
            console.log(`Response snippet: ${text.slice(0, 1000)}`);
            console.log('--------------------------------------------------');
        } catch (e) {
            console.error(`Failed: ${e.message}`);
            console.log('--------------------------------------------------');
        }
    }
}

testEndpoints();
