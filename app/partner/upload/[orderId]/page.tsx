import MobileUploadClient from './MobileUploadClient';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Upload Prove - FloreMoria Partner',
  description: 'Area riservata per il caricamento off-line delle conferme fotografiche dai cimiteri.',
};

export default async function FloristUploadPage({ params }: { params: Promise<{ orderId: string }> | { orderId: string } }) {
  // Estraggo il codice ID dall'URL univoco
  const resolvedParams = await Promise.resolve(params);
  const { orderId } = resolvedParams;

  if (!orderId) {
    return notFound();
  }

  // Qui in futuro il backend leggerà il database per estrarre il tipo di ordine
  // const order = await prisma.order.findUnique({ where: { orderNumber: orderId } });
  // const isFuneral = order?.type === 'FUNERAL';
  const isFuneral = false; // Mock for scaffolding

  return (
    <div className="min-h-screen bg-[#F0F2F5] pb-24 font-body text-[#111B21]">
        <MobileUploadClient orderId={orderId} isFuneral={isFuneral} />
    </div>
  );
}
