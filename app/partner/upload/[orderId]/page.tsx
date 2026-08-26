import { redirect } from 'next/navigation';
import { buildFloristDeliveryPath } from '@/lib/orders/resolveOrderIdentifier';

export const metadata = {
    title: 'Upload Prove - FloreMoria Partner',
    description: 'Reindirizzamento alla mini-app fiorista per le conferme fotografiche.',
};

/**
 * Legacy: /partner/upload/[orderId] → mini-app /fiorista/consegna/[orderId].
 * Evita la pagina stub “in allestimento” ancora citata in link vecchi.
 */
export default async function FloristUploadRedirectPage({
    params,
}: {
    params: Promise<{ orderId: string }> | { orderId: string };
}) {
    const resolved = await Promise.resolve(params);
    const orderId = resolved.orderId?.trim();
    if (!orderId) {
        redirect('/');
    }
    redirect(buildFloristDeliveryPath({ id: orderId, orderNumber: orderId }));
}
