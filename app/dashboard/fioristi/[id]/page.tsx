import prisma from '@/lib/prisma';
import { ordersListPageWhere } from '@/lib/dashboardOrdersFilter';
import { notFound } from 'next/navigation';
import { Building2, MapPin, MessageCircle, Star } from 'lucide-react';
import ClientFloristDossier from './ClientFloristDossier';
import ClientFloristDossierHeader from './ClientFloristDossierHeader';
import { enrichOrderWithShareableLinks } from '@/lib/dashboard/enrichOrderShareableLinks';

export default async function FloristDossierPage({ params }: { params: { id: string } }) {
    const { id } = await params;

    const partner = await prisma.partner.findUnique({
        where: { id },
        include: {
            orders: {
                where: ordersListPageWhere(),
                include: {
                    items: {
                        include: {
                            product: true,
                        },
                    },
                },
                orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            },
        },
    });

    if (!partner) {
        return notFound();
    }

    const activeOrders = partner.orders.filter((o) => o.status !== 'CANCELLED' && !o.deletedAt).length;

    return (
        <div className="fixed top-14 left-0 right-0 bottom-0 z-40 bg-[#FAF9F6] flex flex-col print:static print:inset-auto print:z-auto">
            <ClientFloristDossierHeader partner={partner} />

            <div className="flex-1 overflow-y-auto font-body print:overflow-visible">
                <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
                    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Building2 size={18} className="text-fm-gold" />
                                    Anagrafica operativa
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Archivio storico consegne e dati amministrativi del fiorista.
                                </p>
                            </div>
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-100 text-amber-800 text-sm font-semibold shrink-0">
                                <Star size={14} className="text-[#D4AF37]" fill="currentColor" />
                                {partner.adminRating.toFixed(1)} / 5.0
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                            <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-100">
                                <div className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1">
                                    Area operativa
                                </div>
                                <div className="text-gray-900 font-medium flex items-center gap-1.5">
                                    <MapPin size={14} className="text-gray-400 shrink-0" />
                                    {partner.coverageArea || 'Non definita'}
                                    {partner.province ? (
                                        <span className="font-bold text-black">({partner.province})</span>
                                    ) : null}
                                </div>
                            </div>
                            <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                                <div className="font-semibold text-emerald-900 uppercase tracking-wider text-[10px] mb-1">
                                    WhatsApp
                                </div>
                                <div className="text-emerald-700 font-bold flex items-center gap-1.5">
                                    <MessageCircle size={14} />
                                    {partner.whatsappNumber || 'Nessuno'}
                                </div>
                            </div>
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                <div className="font-semibold text-blue-900 uppercase tracking-wider text-[10px] mb-1">
                                    Ordini attivi
                                </div>
                                <div className="text-blue-700 font-bold text-lg">{activeOrders}</div>
                            </div>
                            <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-100">
                                <div className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1">
                                    IBAN
                                </div>
                                <div className="text-gray-800 font-medium truncate" title={partner.iban || 'Non inserito'}>
                                    {partner.iban || 'Non inserito'}
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-8 border-t border-gray-100">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">
                                Dati fiscali e fatturazione
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                                <div>
                                    <div className="font-semibold text-gray-500 uppercase tracking-wider text-[11px] mb-1">
                                        Partita IVA
                                    </div>
                                    <div className="text-gray-900 font-semibold font-mono">{partner.vatNumber || '—'}</div>
                                </div>
                                <div>
                                    <div className="font-semibold text-gray-500 uppercase tracking-wider text-[11px] mb-1">
                                        Codice Fiscale
                                    </div>
                                    <div className="text-gray-900 font-semibold font-mono">{partner.taxCode || '—'}</div>
                                </div>
                                <div>
                                    <div className="font-semibold text-gray-500 uppercase tracking-wider text-[11px] mb-1">
                                        Codice SDI
                                    </div>
                                    <div className="text-gray-900 font-semibold font-mono uppercase">{partner.sdiCode || '—'}</div>
                                </div>
                                <div>
                                    <div className="font-semibold text-gray-500 uppercase tracking-wider text-[11px] mb-1">
                                        Email
                                    </div>
                                    <div className="text-blue-600 font-semibold truncate" title={partner.email || ''}>
                                        {partner.email || '—'}
                                    </div>
                                </div>
                                <div>
                                    <div className="font-semibold text-gray-500 uppercase tracking-wider text-[11px] mb-1">
                                        Indirizzo PEC
                                    </div>
                                    <div className="text-blue-600 font-semibold truncate" title={partner.pecAddress || ''}>
                                        {partner.pecAddress || '—'}
                                    </div>
                                </div>
                                <div>
                                    <div className="font-semibold text-gray-500 uppercase tracking-wider text-[11px] mb-1">
                                        Indirizzo
                                    </div>
                                    <div className="text-gray-900 font-medium">{partner.address || '—'}</div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <ClientFloristDossier
                        partner={partner}
                        orders={partner.orders.map(enrichOrderWithShareableLinks)}
                    />
                </div>
            </div>
        </div>
    );
}
