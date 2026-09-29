'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
import { formatEuroFromCents } from '@/lib/floristNetwork/qrAdminViews';

type Props = {
    order: {
        id: string;
        partnerId?: string | null;
        deliveryProvince?: string | null;
        floristCompensationCents?: number | null;
        coordinatorFloristId?: string | null;
        coordinationFeeCents?: number | null;
        isTest?: boolean | null;
        status?: string | null;
        cancellationCause?: string | null;
        partner?: {
            id?: string;
            shopName?: string | null;
            networkRole?: string | null;
            networkStatus?: string | null;
            assignedProvinces?: string[] | null;
        } | null;
    };
    canEdit: boolean;
    onOrderUpdated?: (updated: Record<string, unknown>) => void;
};

/**
 * Leader ACTIVE + ordine assegnato a lui + provincia nella zona.
 * Nessun filtro su status: vale anche COMPLETED / DELIVERING (staff può spuntare a posteriori).
 */
function isLeaderZoneOrder(order: Props['order']): boolean {
    const p = order.partner;
    if (!p || p.networkRole !== 'LEADER' || p.networkStatus !== 'ACTIVE') return false;
    if (!order.partnerId || order.partnerId !== p.id) return false;
    const prov = (order.deliveryProvince || '').trim().toUpperCase();
    const zones = p.assignedProvinces || [];
    return Boolean(prov && zones.map((z) => z.toUpperCase()).includes(prov));
}

/**
 * Spunta «Affidato a collega» + riquadro esecuzione (Operazione 4).
 * Solo Admin/SA su ordini del Leader nella sua zona (qualsiasi stato, incluso COMPLETED).
 */
export default function OrderColleagueDelegationPanel({ order, canEdit, onOrderUpdated }: Props) {
    const inZone = isLeaderZoneOrder(order);
    const delegated = Boolean(
        order.coordinatorFloristId && (order.coordinationFeeCents || 0) > 0
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Visibile se in zona Leader (anche COMPLETED) oppure già affidato (storico).
    if (!inZone && !delegated) return null;

    const feeLabel = formatEuroFromCents(order.coordinationFeeCents || 0);
    const compLabel = formatEuroFromCents(order.floristCompensationCents || 0);

    const toggle = async (next: boolean) => {
        if (!canEdit || busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/dashboard/orders/${order.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delegatedToColleague: next }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setError(data?.error || 'Aggiornamento fallito');
                return;
            }
            onOrderUpdated?.(data);
        } catch {
            setError('Errore di connessione');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
            <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <Users size={16} className="text-emerald-700" />
                Esecuzione zona
            </h4>

            <p className="text-sm text-gray-800">
                {delegated ? (
                    <>
                        Affidato a collega – coordinamento <strong>{feeLabel}</strong>
                        <span className="block text-xs text-gray-500 mt-0.5">
                            Compenso esecuzione {compLabel} · fee 10% al Leader
                        </span>
                    </>
                ) : (
                    <>
                        Esecuzione: Leader
                        <span className="block text-xs text-gray-500 mt-0.5">
                            Nessun coordinamento (esegue il Leader)
                        </span>
                    </>
                )}
            </p>

            {canEdit && inZone ? (
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={delegated}
                        disabled={busy || Boolean(order.isTest)}
                        onChange={(e) => void toggle(e.target.checked)}
                        className="rounded border-gray-300 text-emerald-700 focus:ring-emerald-500"
                    />
                    Affidato a collega
                </label>
            ) : null}

            {error ? <p className="text-xs text-red-700 font-medium">{error}</p> : null}
        </div>
    );
}
