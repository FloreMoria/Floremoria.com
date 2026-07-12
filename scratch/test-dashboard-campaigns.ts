import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';
import { GET as getCampaigns, POST as saveTheme } from '../app/api/dashboard/campaigns/route';
import { POST as forcePublish } from '../app/api/dashboard/campaigns/publish/route';

loadEnvFiles();

async function runTests() {
  console.log('=== TESTING CAMPAIGNS DASHBOARD API ENDPOINTS ===');

  // 1. Test GET campaigns
  console.log('\nTesting GET campaigns endpoint...');
  const getRes = await getCampaigns();
  const getData = await getRes.json();
  console.log(`GET status = ${getRes.status}, success = ${getData.success}`);
  console.log(`Total campaigns returned: ${getData.campaigns?.length}`);
  console.log(`Active Theme: "${getData.activeTheme}"`);
  console.log(`Manual Theme Override: "${getData.manualThemeOverride}"`);

  // 2. Test POST save manual theme override
  console.log('\nTesting POST save theme override...');
  const testTheme = 'TEMA DI VERIFICA DASHBOARD - Autunno dorato e sentimenti profondi';
  
  const postRes = await saveTheme(new Request('http://localhost:3000/api/dashboard/campaigns', {
    method: 'POST',
    body: JSON.stringify({ theme: testTheme })
  }));
  const postData = await postRes.json();
  console.log(`POST status = ${postRes.status}, success = ${postData.success}`);
  console.log(`New Manual Override: "${postData.manualThemeOverride}"`);
  console.log(`New Active Theme: "${postData.activeTheme}"`);

  // 3. Clean up the override
  console.log('\nRestoring automatic theme (sending empty string)...');
  const cleanRes = await saveTheme(new Request('http://localhost:3000/api/dashboard/campaigns', {
    method: 'POST',
    body: JSON.stringify({ theme: '' })
  }));
  const cleanData = await cleanRes.json();
  console.log(`Clean status = ${cleanRes.status}, success = ${cleanData.success}`);
  console.log(`Manual Override after clean: "${cleanData.manualThemeOverride}"`);

  // 4. Test Force Publish in simulated mode (using a mock campaign or an approved one)
  console.log('\nTesting Force Publish...');
  const approvedCampaign = await prisma.marketingCampaign.findFirst({
    where: { status: 'APPROVED' }
  });

  if (approvedCampaign) {
    console.log(`Found APPROVED campaign: ${approvedCampaign.id} to ${approvedCampaign.targetChannel}`);
    
    // We run the force publish route (it will run in simulated mode if social keys are absent)
    const pubRes = await forcePublish(new Request('http://localhost:3000/api/dashboard/campaigns/publish', {
      method: 'POST',
      body: JSON.stringify({ campaignId: approvedCampaign.id })
    }));
    const pubData = await pubRes.json();
    console.log(`Publish status = ${pubRes.status}, success = ${pubData.success}`);
    if (pubData.success) {
      console.log(`Publish results - simulated: ${pubData.simulated}, externalId: ${pubData.externalId}`);
      
      // Revert status back to APPROVED to avoid dirtying database state
      await prisma.marketingCampaign.update({
        where: { id: approvedCampaign.id },
        data: { status: 'APPROVED' }
      });
      console.log('Restored campaign status to APPROVED.');
    } else {
      console.log(`Failed (expected if token validation fails): ${pubData.error}`);
    }
  } else {
    console.log('No APPROVED campaign found to test publishing.');
  }

  console.log('\n=== ALL ENDPOINT TESTS COMPLETED ===');
}

runTests().catch(console.error);
