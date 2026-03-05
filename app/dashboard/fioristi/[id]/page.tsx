import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ClientFloristDossier from './ClientFloristDossier';
import ClientPrintButton from './ClientPrintButton';

export default async function FloristDossierPage({ params }: { params: { id: string } }) {
    const { id } = await params;

    const partner = await prisma.partner.findUnique({
        where: { id },
        include: {
            orders: {
                include: {
                    items: {
                        include: {
                            product: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }
        }
    });

    if (!partner) {
        return notFound();
    }

    return (
        <div className="max-w-5xl mx-auto px-6 py-10 pb-20 fade-in">
            <Link href="/dashboard/fioristi" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors mb-6 font-medium">
                <ArrowLeft size={16} /> Torna a Fioristi
            </Link>

            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm mb-8">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h1 className="text-3xl font-display font-bold text-gray-900 mb-1">{partner.ownerName}</h1>
                        <p className="text-gray-500 font-medium text-lg mb-2">{partner.shopName}</p>
                        <p className="text-gray-400 text-sm">Archivio storico delle consegne e gestione file associati a questo Fiorista.</p>
                    </div>
                    <ClientPrintButton />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-6">
                    <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-100">
                        <div className="font-semibold text-gray-900 mb-0.5">Area Operativa</div>
                        <div className="text-gray-600 font-medium">{partner.coverageArea || 'Non definita'}</div>
                    </div>
                    <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                        <div className="font-semibold text-emerald-900 mb-0.5">WhatsApp / Contact</div>
                        <div className="text-emerald-700 font-bold">{partner.whatsappNumber || 'Nessuno'}</div>
                    </div>
                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                        <div className="font-semibold text-blue-900 mb-0.5">IBAN / Dati Bancari</div>
                        <div className="text-blue-700 font-medium truncate" title={partner.iban || 'Nessuno'}>{partner.iban || 'Non inserito'}</div>
                    </div>
                    <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                        <div className="font-semibold text-amber-900 mb-0.5">Rating Interno</div>
                        <div className="text-amber-700 font-bold">{partner.adminRating.toFixed(1)} / 5.0</div>
                    </div>
                </div>

                <div className="mt-8 pt-8 border-t border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Dati Fiscali e Fatturazione</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
                        <div>
                            <div className="font-semibold text-gray-500 uppercase tracking-wider text-[11px] mb-1">Partita IVA</div>
                            <div className="text-gray-900 font-semibold font-mono">{partner.vatNumber || '-'}</div>
                        </div>
                        <div>
                            <div className="font-semibold text-gray-500 uppercase tracking-wider text-[11px] mb-1">Codice Fiscale</div>
                            <div className="text-gray-900 font-semibold font-mono">{partner.taxCode || '-'}</div>
                        </div>
                        <div>
                            <div className="font-semibold text-gray-500 uppercase tracking-wider text-[11px] mb-1">Codice SDI</div>
                            <div className="text-gray-900 font-semibold font-mono uppercase">{partner.sdiCode || '-'}</div>
                        </div>
                        <div>
                            <div className="font-semibold text-gray-500 uppercase tracking-wider text-[11px] mb-1">Indirizzo PEC</div>
                            <div className="text-blue-600 font-semibold truncate" title={partner.pecAddress || ''}>{partner.pecAddress || '-'}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Iniezione Moduli Interattivi */}
            <ClientFloristDossier partner={partner} orders={partner.orders} />
        </div>
    );
}
