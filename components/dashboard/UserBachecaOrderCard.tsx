import type { DeliveryProof, DeceasedProfile, Order, OrderItem, Product } from '@prisma/client';
import { Calendar, ExternalLink, MapPin } from 'lucide-react';
import AdminManualProofUploadPanel from '@/components/dashboard/AdminManualProofUploadPanel';
import CustodiedProofGallery from '@/components/dashboard/CustodiedProofGallery';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';
import {
    customerFacingDeliveryDateLabel,
    formatCustomerFacingDeliveryDate,
    resolveCustomerFacingDeliveryDate,
} from '@/lib/orders/displayDeliveryDate';

export type BachecaOrder = Order & {
    items: (OrderItem & { product: Product })[];
    deliveryProof: DeliveryProof | null;
    deceasedProfile: DeceasedProfile | null;
};

export type DeceasedOrderGroup = {
    key: string;
    deceasedName: string;
    cemeteryLabel: string;
    photoUrl: string | null;
    orders: BachecaOrder[];
};

function orderSortTime(order: BachecaOrder): number {
    return resolveCustomerFacingDeliveryDate(order)?.getTime() ?? order.createdAt.getTime();
}

export function groupOrdersByDeceased(orders: BachecaOrder[]): DeceasedOrderGroup[] {
    const map = new Map<string, DeceasedOrderGroup>();

    for (const order of orders) {
        const key = order.deceasedProfileId ?? `name:${order.deceasedName.trim().toLowerCase()}`;
        const deceasedName = order.deceasedProfile?.fullName ?? order.deceasedName;
        const cemeteryLabel = order.deceasedProfile?.cemeteryName
            ? `${order.deceasedProfile.cemeteryName}, ${order.deceasedProfile.cemeteryCity}`
            : `${order.cemeteryName}, ${order.cemeteryCity}`;

        const group = map.get(key);
        if (group) {
            group.orders.push(order);
        } else {
            map.set(key, {
                key,
                deceasedName,
                cemeteryLabel,
                photoUrl: order.deceasedProfile?.photoUrl ?? null,
                orders: [order],
            });
        }
    }

    return Array.from(map.values())
        .map((group) => ({
            ...group,
            orders: [...group.orders].sort((a, b) => orderSortTime(b) - orderSortTime(a)),
        }))
        .sort((a, b) => orderSortTime(b.orders[0]) - orderSortTime(a.orders[0]));
}

function getStatusLabel(status: string) {
    switch (status) {
        case 'PENDING':
        case 'ACCEPTED':
            return { text: 'Ordine Ricevuto', color: 'bg-blue-50 text-blue-700 border-blue-100', step: 1 };
        case 'IN_PROGRESS':
        case 'DELIVERING':
            return { text: 'In Preparazione', color: 'bg-amber-50 text-amber-700 border-amber-100', step: 2 };
        case 'COMPLETED':
            return { text: 'Consegnato', color: 'bg-emerald-50 text-emerald-700 border-emerald-100', step: 3 };
        case 'CANCELLED':
            return { text: 'Annullato', color: 'bg-slate-100 text-slate-600 border-slate-200', step: 0 };
        default:
            return { text: status, color: 'bg-slate-50 text-slate-600 border-slate-100', step: 1 };
    }
}

type OrderCardProps = {
    order: BachecaOrder;
    highlight?: string;
    showFinancialDetails: boolean;
    showGpsMap: boolean;
    showAdminUpload: boolean;
};

export function UserBachecaOrderCard({
    order,
    highlight,
    showFinancialDetails,
    showGpsMap,
    showAdminUpload,
}: OrderCardProps) {
    const status = getStatusLabel(order.status);
    const isHighlighted = highlight === order.id || highlight === order.orderNumber;
    const lat = order.latitude ?? order.deliveryProof?.gpsLatitude;
    const lng = order.longitude ?? order.deliveryProof?.gpsLongitude;
    const deceasedDisplayName = order.deceasedProfile?.fullName ?? order.deceasedName;
    const proofPhotos = getOrderProofPhotos(order);
    const deliveryDateLabel = customerFacingDeliveryDateLabel(order);
    const deliveryDateText = formatCustomerFacingDeliveryDate(order, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
    const primaryPhotoUrl = proofPhotos.after[0] ?? proofPhotos.before[0] ?? null;
    const isDelivered =
        order.status === 'COMPLETED' ||
        order.deliveryProof?.status === 'COMPLETED' ||
        Boolean(order.deliveryProof?.timestampAfter);

    return (
        <div
            id={`order-${order.id}`}
            className={`bg-white rounded-[20px] border shadow-[0_8px_30px_rgb(0,0,0,0.02)] overflow-hidden scroll-mt-24 ${
                isHighlighted ? 'border-[#c5a880] ring-2 ring-[#c5a880]/40' : 'border-slate-100'
            }`}
        >
            <div className="bg-slate-50/70 border-b border-slate-100 px-6 py-4 flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-slate-900 border border-slate-200 px-2.5 py-1 rounded-lg bg-white shadow-inner">
                        #{order.orderNumber}
                    </span>
                    <span
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${status.color}`}
                    >
                        {status.text}
                    </span>
                </div>
                {deliveryDateText ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                        <Calendar size={13} />
                        <span>
                            {deliveryDateLabel}{' '}
                            <span className="text-slate-700 font-semibold">{deliveryDateText}</span>
                        </span>
                    </div>
                ) : null}
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-7 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Luogo di Consegna
                            </div>
                            <div className="text-sm font-semibold text-slate-700 flex items-start gap-1">
                                <MapPin size={14} className="text-[#c5a880] mt-0.5 shrink-0" />
                                <span>
                                    {order.cemeteryName} ({order.deliveryProvince})
                                </span>
                            </div>
                        </div>
                        {showFinancialDetails ? (
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Importo ordine
                                </div>
                                <div className="text-base font-bold text-slate-800 font-mono">
                                    €{(order.totalPriceCents / 100).toFixed(2)}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            Composizione Floreale
                        </div>
                        <div className="space-y-2">
                            {order.items.map((item) => (
                                <div key={item.id} className="flex justify-between items-center text-sm">
                                    <span className="font-semibold text-slate-700">
                                        {item.product.name}{' '}
                                        <span className="text-slate-400 font-normal">x{item.quantity}</span>
                                    </span>
                                    {showFinancialDetails ? (
                                        <span className="font-mono text-slate-500 font-medium">
                                            €{(item.priceCents / 100).toFixed(2)}
                                        </span>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>

                    {isDelivered && primaryPhotoUrl ? (
                        <div className="border-t border-slate-100 pt-4">
                            <a
                                href={primaryPhotoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#c5a880]/40 bg-[#c5a880]/10 text-[#8a7048] text-xs font-bold uppercase tracking-wider hover:bg-[#c5a880]/20 transition-colors"
                            >
                                <ExternalLink size={14} />
                                Vedi foto della posa
                            </a>
                        </div>
                    ) : null}
                </div>

                <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-slate-100 pt-6 lg:pt-0 lg:pl-8 flex flex-col justify-center">
                    <CustodiedProofGallery
                        orderId={order.id}
                        deceasedName={deceasedDisplayName}
                        initialBefore={proofPhotos.before}
                        initialAfter={proofPhotos.after}
                        lat={lat}
                        lng={lng}
                        isAdmin={showAdminUpload}
                        showGpsMap={showGpsMap}
                        hasPreDeliveryPhotoOpt={order.items.some(
                            (item) => item.productId === 'florem-foto-stato-prima'
                        )}
                    />

                    {showAdminUpload ? (
                        <AdminManualProofUploadPanel
                            orderId={order.id}
                            orderNumber={order.orderNumber}
                            deceasedName={order.deceasedName}
                            cemeteryName={order.cemeteryName}
                            cemeteryCity={order.cemeteryCity}
                        />
                    ) : null}
                </div>
            </div>
        </div>
    );
}
