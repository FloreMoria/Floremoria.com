'use client';

import { QrCode } from 'lucide-react';
import {
    formatEuroFromCents,
    hasPartnerQrOrigin,
    resolveQrFeeStatus,
} from '@/lib/floristNetwork/qrAdminViews';

type MiniPartner = {
    id?: string;
    shopName?: string | null;
    ownerName?: string | null;
    uniqueCode?: string | null;
    slug?: string | null;
};

type Props = {
    order: {
        referralFloristId?: string | null;
        referralFeeCents?: number | null;
        isTest?: boolean | null;
        status?: string | null;
        cancellationCause?: string | null;
        deletedAt?: string | Date | null;
        referralFlorist?: MiniPartner | null;
        referralScanEvent?: { createdAt?: string | Date | null } | null;
        executorFloristId?: string | null;
        executorFlorist?: MiniPartner | null;
        coordinatorFloristId?: string | null;
        coordinatorFlorist?: MiniPartner | null;
        coordinationFeeCents?: number | null;
    };
};

function partnerLabel(p?: MiniPartner | null): string {
    if (!p) return '—';
    return p.shopName || p.ownerName || p.uniqueCode || p.slug || '—';
}

function formatScanAt(value?: string | Date | null): string {
    if (!value) return '—';
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(d);
}

/**
 * Riquadro sola lettura Origine QR (Admin/Super Admin).
 * Sempre visibile se c’è referralFloristId — anche isTest / annullati (stato fee in badge).
 * Art. 7.2: nessun dato acquirente — solo fee / scansione / rete.
 */
export default function OrderQrOriginPanel({ order }: Props) {
    // Unica condizione di nascosto: assenza di referral QR (null-safe).
    if (!hasPartnerQrOrigin(order)) return null;

    const feeStatus = resolveQrFeeStatus(order);
    const feeCents = order.referralFeeCents ?? 0;
    const isSubDelegated = Boolean(
        order.executorFloristId || order.coordinatorFloristId
    );

    const statusClass =
        feeStatus.kind === 'valid'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : feeStatus.kind === 'excluded_test'
              ? 'bg-amber-50 text-amber-900 border-amber-200'
              : feeStatus.kind.startsWith('excluded_cancelled')
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-gray-50 text-gray-700 border-gray-200';

    return (
        <div className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
            <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <QrCode size={16} className="text-violet-600" />
                Origine QR
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700/80">
                        Fiorista referral
                    </div>
                    <div className="font-semibold text-gray-900 mt-0.5">
                        {partnerLabel(order.referralFlorist)}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700/80">
                        Scansione
                    </div>
                    <div className="font-medium text-gray-800 mt-0.5">
                        {formatScanAt(order.referralScanEvent?.createdAt)}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700/80">
                        Fee QR
                    </div>
                    <div className="font-semibold text-gray-900 mt-0.5">
                        {formatEuroFromCents(feeCents)}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700/80">
                        Stato fee
                    </div>
                    <div className="mt-0.5">
                        <span
                            className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold border ${statusClass}`}
                        >
                            {feeStatus.label}
                        </span>
                    </div>
                </div>
            </div>

            {isSubDelegated ? (
                <div className="pt-2 border-t border-violet-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700/80">
                            Esecutore
                        </div>
                        <div className="font-medium text-gray-900 mt-0.5">
                            {partnerLabel(order.executorFlorist)}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700/80">
                            Coordinatore
                        </div>
                        <div className="font-medium text-gray-900 mt-0.5">
                            {partnerLabel(order.coordinatorFlorist)}
                            {(order.coordinationFeeCents ?? 0) > 0 ? (
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    Fee coordinamento {formatEuroFromCents(order.coordinationFeeCents || 0)}
                                </span>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
