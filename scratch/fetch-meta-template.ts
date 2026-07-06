import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
    const apiKey = process.env.WHATSAPP_CLOUD_API_KEY!;
    const wabaId = process.env.META_BUSINESS_ACCOUNT_ID!;
    const v = process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0';
    const name = process.argv[2] || 'floremoria_messaggio_personalizzato_fiorista';

    const url = `https://graph.facebook.com/${v}/${wabaId}/message_templates?name=${encodeURIComponent(name)}&limit=10&fields=name,language,status,parameter_format,components`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));

    const templates = (data as { data?: Array<{ name: string; language: string; components: unknown[] }> }).data;
    if (templates?.length) {
        for (const t of templates) {
            const body = (t.components as Array<{ type: string; text?: string; example?: unknown }>).find(
                (c) => c.type === 'BODY'
            );
            console.log('\n---', t.name, t.language, '---');
            console.log('BODY:', body?.text);
            console.log('example:', JSON.stringify(body?.example));
        }
    }
}

main().catch(console.error);
