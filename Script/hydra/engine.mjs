import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), 'hydra-keys.env') });

const CONFIG = {
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OUTPUT_FILE: path.join(process.cwd(), 'hydra_prospects.csv'),
  COMPLETED_CITIES_FILE: path.join(process.cwd(), 'hydra_completed.json'),
  MAX_CITIES: 500, 
  DELAY_BETWEEN_CITIES_MS: 3000,
};

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getUnprocessedCities() {
  const response = await axios.get('https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json');
  let allCities = response.data;
  
  // Ordiniamo per popolazione se possibile, altrimenti prendiamo semplicemente l'array
  // Il dataset ha 'popolazione' se disponibile, limitiamo a 500
  if (allCities[0].popolazione) {
    allCities.sort((a,b) => b.popolazione - a.popolazione);
  }
  
  const topCities = allCities.slice(0, CONFIG.MAX_CITIES).map(c => c.nome);
  
  let completed = [];
  try {
    const data = await fs.readFile(CONFIG.COMPLETED_CITIES_FILE, 'utf-8');
    completed = JSON.parse(data);
  } catch(e) { }
  
  return topCities.filter(c => !completed.includes(c));
}

async function markCityCompleted(city) {
  let completed = [];
  try {
    completed = JSON.parse(await fs.readFile(CONFIG.COMPLETED_CITIES_FILE, 'utf-8'));
  } catch(e){}
  completed.push(city);
  await fs.writeFile(CONFIG.COMPLETED_CITIES_FILE, JSON.stringify(completed, null, 2));
}

async function extractEmailFromWebsite(url) {
  try {
    // Usiamo timeout rigido in modo da non restare bloccati all'infinito
    const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = res.data;
    const $ = cheerio.load(html);
    
    // Cerca mailto
    let email = null;
    $('a[href^="mailto:"]').each((i, el) => {
      if (!email) email = $(el).attr('href').replace('mailto:', '').split('?')[0].trim();
    });
    
    if (email) return email;

    // RegEx pura sul testo
    const text = $('body').text();
    const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (match) return match[0];

    return null;
  } catch (err) {
    return null;
  }
}

async function generateEmailAI(floristName, city) {
  if (!CONFIG.OPENAI_API_KEY) {
     return {
         gender: 'N/A',
         subject: '[API KEY MANCANTE] Re: Cimitero',
         body: 'Inserisci le credenziali OpenAI per attivare Barbara e gli altri Agent.'
     };
  }

  const sysPrompt = `Sei l'AI B2B di FloreMoria. Fai convergere queste personalità:\n1. Vince (Marketing): Oggetto email curioso.\n2. Alma (Empathy): Tono rispettoso (parliamo di cura delle tombe).\n3. Mark (Sales): CTA veloce e diretta.\n4. Vera (Trust): Menziouna zero costi e pagamenti anticipati.\n5. Barbara (Compliance): Inserisci nota "Legittimo interesse B2B. Rispondi STOP per cancellazione".\n\nNome Attività: "${floristName}" in città: "${city}".\nDedici il sesso (M, F, Neutro) dal nome e redigi l'email.\nRispondi SOLAMENTE in JSON valido con chiavi: "gender", "subject", "body". No markdown.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: sysPrompt }
        ],
        temperature: 0.7
      })
    });
    
    const data = await response.json();
    const rawText = data.choices[0].message.content;
    const jsonResult = JSON.parse(rawText);
    return jsonResult;
  } catch(e) {
    console.error('API OpenAI Fail:', e.message);
    return { gender: '?', subject: 'Errore AI', body: 'Errore AI' };
  }
}

async function main() {
  console.log('\n-----------------------------------------------------------');
  console.log('🌸 HYDRA ENGINE v1.0 - FLOREMORIA B2B SCRAPER 🌸');
  console.log('-----------------------------------------------------------\n');

  if (!CONFIG.GOOGLE_PLACES_API_KEY) {
    console.log('❗️ [BLOCCO OPERATIVO] GOOGLE_PLACES_API_KEY mancante nel file .env\n');
    return;
  }

  // Assicurati che l'header del CSV esista
  try {
      await fs.access(CONFIG.OUTPUT_FILE);
  } catch (e) {
      await fs.writeFile(CONFIG.OUTPUT_FILE, 'Comune,Nome,Telefono,WhatsappMobile,Email,Sito,GoogleMapLink,GenereAI,OggettoAI,BozzaMailAI\n', 'utf-8');
  }

  const citiesToProcess = await getUnprocessedCities();
  console.log(`📌 Inizio scansione per ${citiesToProcess.length} comuni.\n`);

  for (const city of citiesToProcess) {
    console.log(`🚀 [${city}] Ricerca fioristi vicino al cimitero...`);
    
    try {
      const query = encodeURIComponent(`fiorista cimitero ${city}`);
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${CONFIG.GOOGLE_PLACES_API_KEY}`;
      
      const searchRes = await axios.get(searchUrl);
      
      if (searchRes.data.status !== 'OK' && searchRes.data.status !== 'ZERO_RESULTS') {
          console.log(`   ❗️ ATTENZIONE: Errore API Google -> ${searchRes.data.status}: ${searchRes.data.error_message}`);
      }
      
      const results = searchRes.data.results;
      
      if (!results || results.length === 0) {
          console.log(`   🔸 Nessun fiorista trovato vicino cimitero a ${city}. Passaggio successivo.`);
          await markCityCompleted(city);
          continue;
      }
      
      // Prendiamo solo il più vicino/primo risultato per budget limits (oppure tagliare slice)
      const topProspects = results.slice(0, 2);

      for (const prospect of topProspects) {
         console.log(`   🔎 Investigando: ${prospect.name}`);
         
         // Dettagli Mappa
         const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prospect.place_id}&fields=name,website,formatted_phone_number,url&key=${CONFIG.GOOGLE_PLACES_API_KEY}`;
         const detailsRes = await axios.get(detailsUrl);
         const details = detailsRes.data.result;

         let email = null;
         let isMobile = false;
         let phone = details.formatted_phone_number || '';
         
         // Valuta se è mobile italiano (+39 3.. o 3..)
         if (phone.replace(/\s/g, '').match(/^(\+39)?3\d{8,9}$/)) {
            isMobile = true;
         }

         if (details.website) {
            email = await extractEmailFromWebsite(details.website);
         }

         if (!email && !isMobile) {
             console.log(`   🟡  [${prospect.name}] Né mail né cell whatsapp trovati. Salviamo per telefonata fredda.`);
         }

         // 3. Esecuzione AI Agent
         const aiData = await generateEmailAI(prospect.name, city);

         // Escape CSV
         const safeName = prospect.name.replace(/,/g, '');
         const safeBody = aiData.body ? aiData.body.replace(/\n/g, '\\n').replace(/,/g, ';') : '';
         const safeSubject = aiData.subject ? aiData.subject.replace(/,/g, '') : '';

         const row = `"${city}","${safeName}","${phone}","${isMobile}","${email||''}","${details.website||''}","${details.url||''}","${aiData.gender}","${safeSubject}","${safeBody}"\n`;
         await fs.appendFile(CONFIG.OUTPUT_FILE, row, 'utf-8');
         
         console.log(`   ✅   Tracciato! (Email: ${email ? 'SI' : 'NO'} | Mobile: ${isMobile ? 'SI' : 'NO'})`);
      }

      await markCityCompleted(city);
      await wait(CONFIG.DELAY_BETWEEN_CITIES_MS);

    } catch (e) {
      console.error(`❌ Errore processando il comune ${city}:`, e.message);
    }
  }

  console.log('\n🎉 Scansione Idra completata (o interrotta senza perdita dati). File:', CONFIG.OUTPUT_FILE);
}

main();
