import React from 'react';
import Link from 'next/link';
import { Building2, ExternalLink, Phone, Mail, CheckCircle2, XCircle } from 'lucide-react';
import { ChannelBadge } from '@/components/dashboard/ChannelBadge';

export type LinkedAgency = {
    id: string;
    shopName: string;
    ownerName: string;
    province: string | null;
    coverageArea: string | null;
    address: string | null;
    uniqueCode: string | null;
    whatsappNumber: string | null;
    email: string | null;
    agencyNotificationEmail: string | null;
    partnershipChannel: string | null;
    isActive: boolean;
    ordersCount: number;
    activeOrdersCount?: number;
};

interface PartnerLinkedAgenciesCardProps {
    agencies: LinkedAgency[];
    partnerName?: string;
}

export default function PartnerLinkedAgenciesCard({ agencies, partnerName }: PartnerLinkedAgenciesCardProps) {
    return (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2.5">
                        <Building2 size={20} className="text-indigo-600 shrink-0" />
                        Agenzie Collegate
                        <span className="inline-flex items-center justify-center rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                            {agencies.length}
                        </span>
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Agenzie di onoranze funebri convenzionate o associate a {partnerName || 'questo partner'}.
                    </p>
                </div>
                <Link
                    href="/dashboard/agenzie"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-800 transition-colors shrink-0 self-start sm:self-auto"
                >
                    Gestisci tutte le agenzie <ExternalLink size={14} />
                </Link>
            </div>

            {agencies.length === 0 ? (
                <div className="py-12 px-4 text-center rounded-xl bg-gray-50/50 border border-dashed border-gray-200">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
                        <Building2 size={24} />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-800">Nessuna agenzia collegata a questo partner</h3>
                    <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                        Le agenzie di onoranze funebri che hanno questo partner come fiorista di riferimento predefinito o canale associato appariranno qui automaticamente.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-2xs">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/80 text-[10px] uppercase tracking-wider font-bold text-gray-500">
                                <th className="px-4 py-3">Ragione Sociale / Nome</th>
                                <th className="px-4 py-3">Comune / Prov.</th>
                                <th className="px-4 py-3">Canale</th>
                                <th className="px-4 py-3">Referente / Contatti</th>
                                <th className="px-4 py-3 text-center">Ordini Assegnati</th>
                                <th className="px-4 py-3 text-center">Stato</th>
                                <th className="px-4 py-3 text-right">Azione Rapida</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {agencies.map((agency) => {
                                const cityProv = [agency.coverageArea, agency.province].filter(Boolean).join(' · ') || '—';
                                const contactEmail = agency.agencyNotificationEmail || agency.email || null;
                                const contactPhone = agency.whatsappNumber || null;

                                return (
                                    <tr key={agency.id} className="hover:bg-gray-50/70 transition-colors">
                                        <td className="px-4 py-3.5">
                                            <p className="font-bold text-gray-900 leading-snug">{agency.shopName}</p>
                                            <p className="text-xs text-gray-400 font-mono mt-0.5">
                                                {agency.uniqueCode || agency.id.slice(0, 8)}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3.5 font-medium text-gray-700 text-xs">
                                            {cityProv}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <ChannelBadge channel={agency.partnershipChannel} />
                                        </td>
                                        <td className="px-4 py-3.5 text-xs text-gray-600 space-y-0.5">
                                            <p className="font-semibold text-gray-800">{agency.ownerName || '—'}</p>
                                            {contactPhone ? (
                                                <p className="flex items-center gap-1 text-[11px] text-gray-500">
                                                    <Phone size={11} className="text-gray-400 shrink-0" />
                                                    {contactPhone}
                                                </p>
                                            ) : null}
                                            {contactEmail ? (
                                                <p className="flex items-center gap-1 text-[11px] text-blue-600 truncate max-w-[200px]" title={contactEmail}>
                                                    <Mail size={11} className="text-blue-400 shrink-0" />
                                                    {contactEmail}
                                                </p>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3.5 text-center font-bold text-gray-900">
                                            <Link
                                                href={`/dashboard/orders?agencyId=${encodeURIComponent(agency.id)}`}
                                                className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-900 transition-colors"
                                                title="Vedi ordini agenzia"
                                            >
                                                {agency.ordersCount} {agency.ordersCount === 1 ? 'ordine' : 'ordini'}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            {agency.isActive ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700">
                                                    <CheckCircle2 size={12} className="text-emerald-500" /> Attiva
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-bold text-gray-500">
                                                    <XCircle size={12} className="text-gray-400" /> Inattiva
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 text-right">
                                            <Link
                                                href={`/dashboard/agenzie?q=${encodeURIComponent(agency.shopName)}`}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-white hover:border-gray-300 transition-all shadow-2xs"
                                            >
                                                Scheda agenzia <ExternalLink size={12} />
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
