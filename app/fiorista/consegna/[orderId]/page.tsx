import {
    evaluateFloristDeliveryAccess,
    isFloristDeliveryFullyComplete,
    isFloristTestOrder,
    isFloristTestOrderRef,
} from '@/lib/deliveryProof/floristAccess';
import { resolveOrderByPublicRef } from '@/lib/orders/resolveOrderIdentifier';
import { buildOrderOptionalsList } from '@/lib/orders/orderOptionals';
import FloristProofUploadClient from '@/components/fiorista/FloristProofUploadClient';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Consegna fiorista | FloreMoria',
};

function BlockedPage({ title, message }: { title: string; message: string }) {
    return (
        <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a880]">Floremoria</p>
            <h1 className="mt-3 text-xl font-display font-semibold text-slate-900">{title}</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>
            <Link
                href="/"
                className="mt-8 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700"
            >
                Torna al sito
            </Link>
        </div>
    );
}

function CompletedPage({ orderNumber }: { orderNumber: string | null }) {
    return (
        <div
            className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center px-6 text-center bg-[#FAF9F6]"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        >
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600 shadow-sm">
                ✓
            </div>
            <h1 className="text-2xl font-display font-bold text-slate-900">
                Consegna registrata con successo!
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 max-w-xs">
                Grazie per il tuo lavoro! Le foto e i dettagli della consegna sono stati registrati correttamente.
                {orderNumber ? ` (${orderNumber})` : ''}
            </p>
            <div className="mt-6 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-5 py-3 text-xs font-semibold text-emerald-800">
                Puoi chiudere la pagina. Per assistenza contatta FloreMoria.
            </div>
        </div>
    );
}

const orderSelect = {
    id: true,
    orderNumber: true,
    deceasedName: true,
    cemeteryName: true,
    cemeteryCity: true,
    status: true,
    updatedAt: true,
    deletedAt: true,
    partnerPaymentStatus: true,
    latitude: true,
    longitude: true,
    ticketMessage: true,
    deliveryProof: {
        select: {
            status: true,
            photosBeforeUrls: true,
            photosAfterUrls: true,
            photoBeforeUrl: true,
            photoAfterUrl: true,
            gpsLatitude: true,
            gpsLongitude: true,
        },
    },
    items: {
        select: {
            quantity: true,
            product: { select: { slug: true, name: true, isBouquet: true } },
        },
    },
} as const;

export default async function FloristConsegnaPage({
    params,
}: {
    params: Promise<{ orderId: string }>;
}) {
    const { orderId: orderRef } = await params;

    const order = await resolveOrderByPublicRef(orderRef, orderSelect);

    if (!order && !isFloristTestOrderRef(orderRef)) {
        return (
            <BlockedPage
                title="Ordine non trovato"
                message="Verifica il codice ordine nel link e riprova."
            />
        );
    }

    if (!order) {
        return (
            <BlockedPage
                title="Ordine non trovato"
                message="L'ordine di test non è presente nel database."
            />
        );
    }

    const access = evaluateFloristDeliveryAccess(order, orderRef);
    if (!access.allowed) {
        if (access.reason === 'pending_unpaid') {
            return (
                <BlockedPage
                    title="Ordine in attesa di pagamento"
                    message="Il link sarà disponibile non appena il pagamento sarà confermato."
                />
            );
        }
        if (access.reason === 'cancelled') {
            return (
                <BlockedPage
                    title="Ordine annullato"
                    message="Questo ordine non è più attivo. Per assistenza contatta FloreMoria."
                />
            );
        }
        return (
            <BlockedPage
                title="Accesso non disponibile"
                message="L'ordine non è disponibile per il caricamento foto in questo momento."
            />
        );
    }

    if (
        isFloristDeliveryFullyComplete(order, order.deliveryProof) &&
        !isFloristTestOrder(order)
    ) {
        return <CompletedPage orderNumber={order.orderNumber} />;
    }

    return (
        <FloristProofUploadClient
            orderId={order.id}
            orderNumber={order.orderNumber}
            deceasedName={order.deceasedName}
            cemeteryName={order.cemeteryName}
            cemeteryCity={order.cemeteryCity}
            ticketMessage={order.ticketMessage}
            accessories={buildOrderOptionalsList(order.items || [])}
        />
    );
}
