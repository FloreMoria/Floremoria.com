import CommunicationsHubClient from './CommunicationsHubClient';
import prisma from '@/lib/prisma';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FloreMoria | Communication Hub',
};

export const dynamic = 'force-dynamic';

export default async function CommunicationsPage() {
  // Recupera gli ultimi Delivery Proofs (con Fallback Protettivo per Server in cache)
  let proofs: any[] = [];
  if (prisma.deliveryProof) {
      try {
        proofs = await prisma.deliveryProof.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            order: { select: { orderNumber: true, deceasedName: true, cemeteryName: true, funeralDate: true } },
            partner: { select: { shopName: true } }
          }
        });
      } catch (e) {
        console.error("Prisma Fetch Error:", e);
      }
  } else {
      console.warn("Attenzione: Prisma Client non aggiornato. Il server Next.js necessita di un riavvio (npm run dev).");
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] p-6 lg:p-8">
      <div className="max-w-[1400px] mx-auto">
        <CommunicationsHubClient initialProofs={proofs} />
      </div>
    </div>
  );
}
