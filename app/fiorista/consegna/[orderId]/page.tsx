import prisma from '@/lib/prisma';
import { evaluateFloristDeliveryAccess } from '@/lib/deliveryProof/floristAccess';
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

export default async function FloristConsegnaPage({
    params,
}: {
    params: Promise<{ orderId: string }>;
}) {
    const { orderId } = await params;

    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
            id: true,
            orderNumber: true,
            deceasedName: true,
            cemeteryName: true,
            cemeteryCity: true,
            status: true,
            updatedAt: true,
            deletedAt: true,
            partnerPaymentStatus: true,
            deliveryProof: { select: { status: true } },
        },
    });

    const access = evaluateFloristDeliveryAccess(order);
    if (!access.allowed) {
        if (access.reason === 'expired') {
            return (
                <BlockedPage
                    title="Link non più attivo"
                    message="Questo ordine è stato completato da più di 48 ore. Per assistenza contatta FloreMoria."
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

    if (order!.deliveryProof?.status === 'COMPLETED') {
        return (
            <BlockedPage
                title="Consegna già registrata"
                message="Le foto per questo ordine sono già state inviate. Grazie per il servizio."
            />
        );
    }

    return (
        <FloristProofUploadClient
            orderId={order!.id}
            orderNumber={order!.orderNumber}
            deceasedName={order!.deceasedName}
            cemeteryName={order!.cemeteryName}
            cemeteryCity={order!.cemeteryCity}
        />
    );
}
