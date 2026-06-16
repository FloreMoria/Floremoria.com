import type { DeliveryProof, DeceasedProfile, Order, OrderItem, Product } from '@prisma/client';
import { Calendar, Download, Heart, Image as ImageIcon, MapPin, Share2 } from 'lucide-react';

export type BachecaOrder = Order & {
    items: (OrderItem & { product: Product })[];
    deliveryProof: DeliveryProof | null;
    deceasedProfile: DeceasedProfile | null;
};

export type DeceasedOrderGroup = {
    key: string;
    deceasedName: string;
    cemeteryLabel: string;
    orders: BachecaOrder[];
};

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
            map.set(key, { key, deceasedName, cemeteryLabel, orders: [order] });
        }
    }

    return Array.from(map.values())
        .map((group) => ({
            ...group,
            orders: [...group.orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        }))
        .sort((a, b) => (b.orders[0]?.createdAt.getTime() ?? 0) - (a.orders[0]?.createdAt.getTime() ?? 0));
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
};

export function UserBachecaOrderCard({ order, highlight, showFinancialDetails, showGpsMap }: OrderCardProps) {
    const status = getStatusLabel(order.status);
    const isHighlighted = highlight === order.id || highlight === order.orderNumber;
    const lat = order.latitude ?? order.deliveryProof?.gpsLatitude;
    const lng = order.longitude ?? order.deliveryProof?.gpsLongitude;

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
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${status.color}`}>
                        {status.text}
                    </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                    <Calendar size={13} />
                    <span>{new Date(order.createdAt).toLocaleDateString('it-IT')}</span>
                </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-7 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Luogo di Consegna</div>
                            <div className="text-sm font-semibold text-slate-700 flex items-start gap-1">
                                <MapPin size={14} className="text-[#c5a880] mt-0.5 shrink-0" />
                                <span>
                                    {order.cemeteryName} ({order.deliveryProvince})
                                </span>
                            </div>
                        </div>
                        {showFinancialDetails ? (
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Importo ordine</div>
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
                </div>

                <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-slate-100 pt-6 lg:pt-0 lg:pl-8 flex flex-col justify-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <ImageIcon size={13} /> Testimonianza Fotografica
                    </div>

                    {order.deliveryProof &&
                    (order.deliveryProof.photosAfterUrls.length > 0 || order.deliveryProof.photoAfterUrl) ? (
                        <div className="space-y-4 animate-in fade-in">
                            {order.deliveryProof.photosBeforeUrls.length > 0 ? (
                                <div>
                                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Prima della posa
                                    </p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {order.deliveryProof.photosBeforeUrls.map((url, i) => (
                                            <a
                                                key={`before-${i}`}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="relative aspect-square overflow-hidden rounded-xl border border-slate-200"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={url} alt={`Prima ${i + 1}`} className="h-full w-full object-cover" />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            <div>
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Dopo la posa
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                    {(order.deliveryProof.photosAfterUrls.length > 0
                                        ? order.deliveryProof.photosAfterUrls
                                        : order.deliveryProof.photoAfterUrl
                                          ? [order.deliveryProof.photoAfterUrl]
                                          : []
                                    ).map((url, i) => (
                                        <a
                                            key={`after-${i}`}
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="relative aspect-square overflow-hidden rounded-xl border border-slate-200"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={url} alt={`Dopo ${i + 1}`} className="h-full w-full object-cover" />
                                        </a>
                                    ))}
                                </div>
                            </div>

                            {showGpsMap && lat != null && lng != null ? (
                                <div className="overflow-hidden rounded-2xl border border-slate-200">
                                    <iframe
                                        title="Mappa consegna"
                                        className="h-40 w-full"
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005}%2C${lat - 0.005}%2C${lng + 0.005}%2C${lat + 0.005}&layer=mapnik&marker=${lat}%2C${lng}`}
                                    />
                                    <p className="px-3 py-2 text-[10px] font-mono text-slate-400 bg-slate-50">
                                        GPS: {lat.toFixed(6)}, {lng.toFixed(6)}
                                    </p>
                                </div>
                            ) : null}

                            <div className="flex flex-col sm:flex-row gap-2">
                                <a
                                    href={
                                        order.deliveryProof.photoAfterUrl ||
                                        order.deliveryProof.photosAfterUrls[0] ||
                                        '#'
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-slate-200 hover:border-[#c5a880] hover:text-[#c5a880] rounded-xl text-xs font-bold transition-colors text-slate-700 bg-white"
                                >
                                    <Download size={13} />
                                    Vedi / Scarica
                                </a>
                                <a
                                    href={`https://wa.me/?text=${encodeURIComponent(`Ecco la testimonianza fotografica del mio omaggio floreale FloreMoria per ${order.deceasedName}: ${order.deliveryProof.photoAfterUrl || order.deliveryProof.photosAfterUrls[0] || ''}`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-emerald-200 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-colors bg-white font-bold text-xs"
                                >
                                    <Share2 size={13} />
                                    Condividi con i tuoi cari
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-50/70 border border-dashed border-slate-200 p-8 rounded-2xl text-center space-y-2.5">
                            <div className="text-slate-300 text-3xl">📷</div>
                            <div className="text-xs font-semibold text-slate-500">Foto non ancora disponibile</div>
                            <p className="text-[11px] text-slate-400 max-w-[200px] mx-auto leading-relaxed">
                                Verrà scattata e caricata sul posto dal fiorista partner al momento della posa.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
