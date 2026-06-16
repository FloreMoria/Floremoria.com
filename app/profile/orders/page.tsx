import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Alias pubblico richiesto dalle specifiche PoD → bacheca ordini utente.
 */
export default async function ProfileOrdersPage({
    searchParams,
}: {
    searchParams: Promise<{ orderId?: string; highlight?: string }>;
}) {
    const { orderId, highlight } = await searchParams;
    const id = orderId || highlight;
    if (id) {
        redirect(`/dashboard/user?highlight=${encodeURIComponent(id)}`);
    }
    redirect('/dashboard/user');
}
