'use client';

import { Download, Link2, QrCode, Users } from 'lucide-react';
import type { FloristQrNetworkPayload } from '@/lib/floristNetwork/loadFloristQrNetwork';
import { formatEuroFromCents } from '@/lib/floristNetwork/qrAdminViews';

type Props = {
    data: FloristQrNetworkPayload;
};

function formatDeliveryDate(iso: string | null): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        dateStyle: 'short',
    }).format(new Date(iso));
}

function MonthBlock({
    title,
    month,
}: {
    title: string;
    month: FloristQrNetworkPayload['currentMonth'];
}) {
    return (
        <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-bold text-gray-900 capitalize">{title}</h4>
                <span className="text-xs text-gray-500 capitalize">{month.label}</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Scansioni</div>
                    <div className="text-lg font-bold text-gray-900 mt-0.5">{month.scansCount}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Ordini QR</div>
                    <div className="text-lg font-bold text-gray-900 mt-0.5">{month.qrOrdersCount}</div>
                </div>
                <div className="bg-violet-50 rounded-lg p-3 border border-violet-100">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Fee QR</div>
                    <div className="text-lg font-bold text-violet-900 mt-0.5">
                        {formatEuroFromCents(month.qrFeesCents)}
                    </div>
                    <div className="text-[10px] text-violet-700/80 mt-0.5">mese pagamento</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        Coordinamento
                    </div>
                    <div className="text-lg font-bold text-emerald-900 mt-0.5">
                        {formatEuroFromCents(month.coordinationFeesCents)}
                    </div>
                    <div className="text-[10px] text-emerald-700/80 mt-0.5">mese consegna</div>
                </div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-800 col-span-2 lg:col-span-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                        Totale fee
                    </div>
                    <div className="text-lg font-bold text-white mt-0.5">
                        {formatEuroFromCents(month.combinedFeesCents)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">QR + coordinamento</div>
                </div>
            </div>

            {month.orders.length === 0 ? (
                <p className="text-xs text-gray-500 italic">Nessun ordine QR in questo mese.</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                            <tr>
                                <th className="text-left px-3 py-2 font-bold">Ordine</th>
                                <th className="text-left px-3 py-2 font-bold">Pagamento</th>
                                <th className="text-right px-3 py-2 font-bold">Importo</th>
                                <th className="text-right px-3 py-2 font-bold">Fee QR</th>
                                <th className="text-left px-3 py-2 font-bold">Affido</th>
                                <th className="text-left px-3 py-2 font-bold">Stato fee</th>
                            </tr>
                        </thead>
                        <tbody>
                            {month.orders.map((o) => (
                                <tr
                                    key={o.orderNumber}
                                    className={`border-t border-gray-50 ${
                                        o.inTotals ? '' : 'bg-amber-50/40 text-gray-600'
                                    }`}
                                >
                                    <td className="px-3 py-2 font-mono font-semibold text-gray-900">
                                        {o.orderNumber}
                                    </td>
                                    <td className="px-3 py-2 text-gray-700">
                                        {o.paidAt
                                            ? new Intl.DateTimeFormat('it-IT', {
                                                  timeZone: 'Europe/Rome',
                                                  dateStyle: 'short',
                                              }).format(new Date(o.paidAt))
                                            : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-800">
                                        {formatEuroFromCents(o.totalPriceCents)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-violet-800">
                                        {formatEuroFromCents(o.referralFeeCents)}
                                    </td>
                                    <td className="px-3 py-2 text-xs">
                                        {o.delegatedToColleague ? (
                                            <span className="font-semibold text-emerald-800">
                                                Collega · {formatEuroFromCents(o.coordinationFeeCents)}
                                            </span>
                                        ) : (
                                            <span className="text-gray-500">Leader</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span
                                            className={
                                                o.inTotals
                                                    ? 'text-emerald-800 font-semibold'
                                                    : 'text-amber-900 font-semibold'
                                            }
                                        >
                                            {o.feeStatusLabel}
                                        </span>
                                        {!o.inTotals ? (
                                            <span className="block text-[10px] text-gray-500 mt-0.5">
                                                fuori totali · {o.orderStatus}
                                            </span>
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function DelegatedOrdersBlock({
    orders,
}: {
    orders: FloristQrNetworkPayload['delegatedOrders'];
}) {
    return (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Users size={16} className="text-emerald-700" />
                    Ordini affidati a collega
                </h4>
                <span className="text-xs text-gray-500">{orders.length} ordini</span>
            </div>
            <p className="text-xs text-gray-500">
                Tutti gli ordini con coordinamento al Leader. Nessun dato cliente. KPI mensile sul mese di
                consegna.
            </p>

            {orders.length === 0 ? (
                <p className="text-xs text-gray-500 italic">Nessun ordine affidato a collega.</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-emerald-100 bg-white">
                    <table className="min-w-full text-sm">
                        <thead className="bg-emerald-50/80 text-[10px] uppercase tracking-wider text-gray-500">
                            <tr>
                                <th className="text-left px-3 py-2 font-bold">Ordine</th>
                                <th className="text-left px-3 py-2 font-bold">Consegna</th>
                                <th className="text-right px-3 py-2 font-bold">Compenso esec.</th>
                                <th className="text-right px-3 py-2 font-bold">Coord. 10%</th>
                                <th className="text-left px-3 py-2 font-bold">Stato</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((o) => (
                                <tr
                                    key={o.orderNumber}
                                    className={`border-t border-gray-50 ${
                                        o.inTotals ? '' : 'bg-amber-50/40 text-gray-600'
                                    }`}
                                >
                                    <td className="px-3 py-2 font-mono font-semibold text-gray-900">
                                        {o.orderNumber}
                                    </td>
                                    <td className="px-3 py-2 text-gray-700">
                                        {formatDeliveryDate(o.deliveryDate)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-800">
                                        {formatEuroFromCents(o.floristCompensationCents)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-emerald-800">
                                        {formatEuroFromCents(o.coordinationFeeCents)}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span
                                            className={
                                                o.inTotals
                                                    ? 'text-emerald-800 font-semibold'
                                                    : 'text-amber-900 font-semibold'
                                            }
                                        >
                                            {o.statusLabel}
                                        </span>
                                        {!o.inTotals ? (
                                            <span className="block text-[10px] text-gray-500 mt-0.5">
                                                fuori totali · {o.orderStatus}
                                            </span>
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/**
 * Sezione sola lettura «Rete & QR» in scheda fiorista (Admin/Super Admin).
 * Art. 7.2: solo codice ordine, mai dati acquirente.
 */
export default function FloristQrNetworkSection({ data }: Props) {
    const roleLabel = data.networkRole || '—';
    const statusLabel = data.networkStatus || '—';
    const isLeader = data.networkRole === 'LEADER';

    return (
        <section className="bg-white rounded-2xl border border-violet-100 shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <QrCode size={18} className="text-violet-600" />
                        Rete &amp; QR
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Prospetto mensile (Art. 9) — fee QR su mese pagamento; coordinamento su mese
                        consegna. Nessun dato cliente.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="bg-violet-50/60 p-4 rounded-xl border border-violet-100">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Ruolo</div>
                    <div className="font-bold text-gray-900 mt-1">{roleLabel}</div>
                </div>
                <div className="bg-violet-50/60 p-4 rounded-xl border border-violet-100">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Stato rete</div>
                    <div className="font-bold text-gray-900 mt-1">{statusLabel}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 sm:col-span-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Zona affidata</div>
                    <div className="font-medium text-gray-900 mt-1">
                        {data.assignedRegion || '—'}
                        {data.assignedProvinces.length > 0
                            ? ` · ${data.assignedProvinces.join(', ')}`
                            : ''}
                        {data.preferredCities.length > 0
                            ? ` · ${data.preferredCities.join(', ')}`
                            : ''}
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Link2 size={12} /> Link QR pubblico
                </div>
                {data.qrUrl ? (
                    <>
                        <a
                            href={data.qrUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-mono text-violet-800 break-all hover:underline"
                        >
                            {data.qrUrl}
                        </a>
                        <div className="flex flex-wrap gap-2">
                            <a
                                href={`/api/dashboard/florists/${data.partnerId}/qr-code?format=png`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-200 bg-white text-violet-900 hover:bg-violet-50"
                            >
                                <Download size={14} /> PNG
                            </a>
                            <a
                                href={`/api/dashboard/florists/${data.partnerId}/qr-code?format=svg`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-200 bg-white text-violet-900 hover:bg-violet-50"
                            >
                                <Download size={14} /> SVG
                            </a>
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-amber-800">Slug QR non impostato — impossibile generare il link.</p>
                )}
            </div>

            {isLeader || data.delegatedOrders.length > 0 ? (
                <DelegatedOrdersBlock orders={data.delegatedOrders} />
            ) : null}

            <MonthBlock title="Mese in corso" month={data.currentMonth} />
            <MonthBlock title="Mese precedente" month={data.previousMonth} />
        </section>
    );
}
