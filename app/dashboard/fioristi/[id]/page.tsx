import prisma from '@/lib/prisma';
import { ordersListPageWhere } from '@/lib/dashboardOrdersFilter';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Building2, MapPin, MessageCircle, Star, UserCircle2 } from 'lucide-react';
import ClientFloristDossier from './ClientFloristDossier';
import ClientPrintButton from './ClientPrintButton';
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
        <div className="fixed inset-0 z-[60] bg-[#FAF9F6] flex flex-col print:static print:inset-auto print:z-auto">
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4 shadow-sm print:hidden">
                <div className="flex items-center gap-4 min-w-0">
                    <Link
                        href="/dashboard/fioristi"
                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 shrink-0"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Elenco fioristi
                    </Link>
                    <div className="w-14 h-14 rounded-full bg-gray-100 border-2 border-white shadow-md flex items-center justify-center shrink-0">
                        <UserCircle2 size={32} className="text-gray-400" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a880] mb-0.5">
                            Dossier fiorista · {partner.uniqueCode || 'N/D'}
                        </p>
                        <h1 className="text-xl sm:text-2xl font-display font-bold text-gray-900 leading-tight truncate">
                            {partner.shopName}
                        </h1>
                        <p className="text-sm text-gray-500 font-medium truncate">
                            {partner.ownerName}
                            {partner.province ? ` · ${partner.province}` : ''}
                            {partner.coverageArea ? ` · ${partner.coverageArea}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <ClientPrintButton />
                    <Link
                        href="/dashboard/fioristi"
                        className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
                        aria-label="Chiudi dossier"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </Link>
                </div>
            </div>

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
