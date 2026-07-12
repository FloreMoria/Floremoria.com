import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';
import {
  getDailyPublishSlots,
  getActiveTheme,
  getRomeCalendarDate,
} from '../lib/marketing/engine/contentCalendar';
import { generateCampaignDraft } from '../lib/marketing/engine/generation';

loadEnvFiles();

async function testCalendarSlots() {
  console.log('\n--- 1. Testing Calendar Slots and Cadences ---');
  
  // Test across multiple simulated days
  const baseDate = new Date('2026-01-01T12:00:00.000Z'); // day 0
  for (let i = 0; i < 5; i++) {
    const testDate = new Date(baseDate.getTime() + i * 86_400_000);
    const slots = getDailyPublishSlots(testDate);
    console.log(`Day ${i} (${testDate.toISOString().slice(0, 10)}):`);
    slots.forEach(s => {
      console.log(`  - ${s.channel} : ${s.contentFormat}`);
    });
  }
}

async function testThemeResolver() {
  console.log('\n--- 2. Testing Theme Resolver ---');

  // Test seasonal themes
  const defuntiDate = new Date('2026-11-02T12:00:00.000Z');
  const nataleDate = new Date('2026-12-25T12:00:00.000Z');
  const mammaDate = new Date('2026-05-10T12:00:00.000Z');
  const normalDate = new Date('2026-07-15T12:00:00.000Z');

  console.log(`Defunti (Nov 2): ${await getActiveTheme(defuntiDate)}`);
  console.log(`Natale (Dec 25): ${await getActiveTheme(nataleDate)}`);
  console.log(`Festa della Mamma (May 10): ${await getActiveTheme(mammaDate)}`);
  console.log(`Normal Day (Jul 15): ${await getActiveTheme(normalDate)}`);

  // Test manual DB override
  console.log('Setting temporary DB manual theme override...');
  const key = 'marketing_active_theme';
  
  // Store existing key if any
  const existing = await prisma.systemState.findUnique({ where: { key } });
  
  await prisma.systemState.upsert({
    where: { key },
    create: { key, value: 'TEMA DI TEST MANUALE - Estate e Ricordi sotto l\'ombrellone' },
    update: { value: 'TEMA DI TEST MANUALE - Estate e Ricordi sotto l\'ombrellone' },
  });

  const resolvedManual = await getActiveTheme(normalDate);
  console.log(`Resolved with DB override: ${resolvedManual}`);

  // Restore/clean up
  if (existing) {
    await prisma.systemState.update({ where: { key }, data: { value: existing.value } });
  } else {
    await prisma.systemState.delete({ where: { key } });
  }
  console.log('DB override cleaned up.');
}

async function testSwarmGeneration() {
  console.log('\n--- 3. Testing Swarm Generation ---');
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.log('Skipping Swarm Generation because GEMINI_API_KEY is not configured.');
    return;
  }

  try {
    const slots = [
      { channel: 'META_INSTAGRAM' as any, contentFormat: 'FEED_POST' as any },
      { channel: 'LINKEDIN' as any, contentFormat: 'FEED_POST' as any },
    ];
    const theme = 'Test Automatizzato di Sinergia Creativa';
    const result = await generateCampaignDraft(
      'FT',
      'Bouquet di Rose di Test',
      19.99,
      slots,
      theme
    );

    console.log('Campaign generated successfully:');
    console.log(JSON.stringify(result, null, 2));

    // Clean up created campaigns
    const ids = result.posts.map(p => p.campaignId);
    console.log(`Cleaning up test campaign records: ${ids.join(', ')}`);
    await prisma.marketingCampaign.deleteMany({
      where: { id: { in: ids } }
    });
  } catch (err) {
    console.error('Error during generation test:', err);
  }
}

async function main() {
  console.log('=== STARTING SOCIAL AUTOMATION UPGRADE TESTS ===');
  await testCalendarSlots();
  await testThemeResolver();
  await testSwarmGeneration();
  console.log('=== TESTS COMPLETED ===');
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
