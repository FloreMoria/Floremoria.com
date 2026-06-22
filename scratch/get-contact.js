// Using global fetch from Node 18+

const apiKey = 'pit-c59d9968-e2b2-4523-9cf2-6d9df7ecf018';
const contactIds = ['s0xG1uJ0xJnwJGfInGny', 'yvHZxy5mMbPF22YQkIkA'];

async function fetchContact(contactId) {
    const url = `https://services.leadconnectorhq.com/contacts/${contactId}`;
    console.log(`\nFetching contact details from: ${url}`);
    
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
                'Version': '2021-04-15'
            }
        });
        console.log(`HTTP Status: ${res.status}`);
        const data = await res.json();
        console.log(`Tags for ${contactId}:`, data.contact?.tags);
    } catch (e) {
        console.error('Failed to fetch contact:', e.message);
    }
}

async function run() {
    for (const id of contactIds) {
        await fetchContact(id);
    }
}

run();
