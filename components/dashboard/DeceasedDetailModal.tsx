'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Calendar,
    Heart,
    Loader2,
    MapPin,
    Phone,
    User,
    Users,
    Flower2,
    Link2,
    AlertCircle,
} from 'lucide-react';
import AdminMediaUploadAvatar from '@/components/dashboard/AdminMediaUploadAvatar';
import CustodiedProofGallery from '@/components/dashboard/CustodiedProofGallery';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';
import type { DeceasedDetailPayload } from '@/lib/deceased/getDeceasedDetail';
import type { DeceasedLeaderRow } from '@/lib/deceased/listDeceasedLeaderRows';

type PartnerOption = {
    id: string;
    shopName: string;
    ownerName: string;
};

type Props = {
    row: DeceasedLeaderRow;
    partners: PartnerOption[];
    onClose: () => void;
    onRegistered: (profileId: string) => void;
};

function formatDisplayDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('it-IT');
}

function orderStatusLabel(status: string): string {
    switch (status) {
        case 'COMPLETED':
            return 'Consegnato';
        case 'IN_PROGRESS':
        case 'DELIVERING':
            return 'In preparazione';
        case 'CANCELLED':
            return 'Annullato';
        default:
            return 'In lavorazione';
    }
}

export default function DeceasedDetailModal({ row, partners, onClose, onRegistered }: Props) {
    const router = useRouter();
    const [detail, setDetail] = useState<DeceasedDetailPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [registering, setRegistering] = useState(false);
    const [savingFlorist, setSavingFlorist] = useState(false);
    const [selectedPartnerId, setSelectedPartnerId] = useState('');

    const loadDetail = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const fetchUrl = row.isOrphan
                ? `/api/dashboard/defunti/${encodeURIComponent(row.orphanSeedOrderId || 'seed')}?kind=orphan&seedOrderId=${encodeURIComponent(row.orphanSeedOrderId || '')}`
                : `/api/dashboard/defunti/${row.deceasedProfileId}`;

            const res = await fetch(fetchUrl);
            const data = (await res.json()) as {
                ok?: boolean;
                error?: string;
                detail?: DeceasedDetailPayload;
            };
            if (!res.ok || !data.ok || !data.detail) {
                throw new Error(data.error || 'Impossibile caricare il dettaglio.');
            }
            setDetail(data.detail);
            setSelectedPartnerId(data.detail.floristPartnerId || '');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore di caricamento.');
        } finally {
            setLoading(false);
        }
    }, [row]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    const handleRegisterOrphan = async () => {
        if (!row.orphanSeedOrderId) return;
        setRegistering(true);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/defunti', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'register_orphan',
                    seedOrderId: row.orphanSeedOrderId,
                }),
            });
            const data = (await res.json()) as {
                ok?: boolean;
                error?: string;
                deceasedProfileId?: string;
            };
            if (!res.ok || !data.ok || !data.deceasedProfileId) {
                throw new Error(data.error || 'Registrazione non riuscita.');
            }
            router.refresh();
            onRegistered(data.deceasedProfileId);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore registrazione.');
        } finally {
            setRegistering(false);
        }
    };

    const handleSaveFlorist = async () => {
        if (!detail?.deceasedProfileId || !selectedPartnerId) return;
        setSavingFlorist(true);
        setError(null);
        try {
            const res = await fetch(`/api/dashboard/defunti/${detail.deceasedProfileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partnerId: selectedPartnerId }),
            });
            const data = (await res.json()) as {
                ok?: boolean;
                error?: string;
                detail?: DeceasedDetailPayload;
            };
            if (!res.ok || !data.ok || !data.detail) {
                throw new Error(data.error || 'Salvataggio fiorista non riuscito.');
            }
            setDetail(data.detail);
            setSelectedPartnerId(data.detail.floristPartnerId || '');
            router.refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore salvataggio fiorista.');
        } finally {
            setSavingFlorist(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAF9F6]">
                    <div className="flex items-center gap-5">
                        {row.deceasedProfileId ? (
                            <AdminMediaUploadAvatar
                                imageUrl={detail?.photoUrl ?? row.photoUrl}
                                fallbackLabel={row.fullName}
                                entity="deceased"
                                entityId={row.deceasedProfileId}
                                onUploaded={(url) =>
                                    setDetail((prev) => (prev ? { ...prev, photoUrl: url } : prev))
                                }
                            />
                        ) : (
                            <div className="w-20 h-20 rounded-full bg-[#EFEAE2] flex items-center justify-center border-4 border-white shadow-md">
                                <Heart size={28} className="text-red-400 fill-red-400" />
                            </div>
                        )}
                        <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a880] mb-1">
                            {detail?.kind === 'orphan' ? 'Scheda orfana — da registrare' : 'Scheda defunto registrato'}
                        </p>
                        <h2 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
                            <Heart size={18} className="text-red-500 fill-red-500" />
                            {row.fullName}
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            {row.cemeteryName || 'Cimitero'} · {row.cemeteryCity}
                            {row.gravePosition ? ` · ${row.gravePosition}` : ''}
                        </p>
                        {detail?.kind === 'orphan' ? (
                            <p className="text-xs text-amber-700 mt-2">
                                Registra il defunto in anagrafica per caricare una foto commemorativa.
                            </p>
                        ) : null}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-8 bg-white">
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                            <Loader2 className="animate-spin" size={20} />
                            Caricamento scheda…
                        </div>
                    ) : error && !detail ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex gap-2">
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            {error}
                        </div>
                    ) : detail ? (
                        <>
                            {detail.kind === 'orphan' ? (
                                <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-semibold text-amber-900">
                                            Questo defunto proviene da {detail.orders.length}{' '}
                                            {detail.orders.length === 1 ? 'ordine' : 'ordini'} non ancora collegati
                                            all&apos;anagrafica commemorativa.
                                        </p>
                                        <p className="text-xs text-amber-800/80 mt-1">
                                            Registralo per abilitare parenti collegati, fiorista custode e gestione prove
                                            visive centralizzata.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={registering}
                                        onClick={handleRegisterOrphan}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f172a] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
                                    >
                                        {registering ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <Link2 size={14} />
                                        )}
                                        Registra in anagrafica
                                    </button>
                                </section>
                            ) : null}

                            {error ? (
                                <p className="text-sm text-red-600 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                                    {error}
                                </p>
                            ) : null}

                            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                                        Date commemorative
                                    </p>
                                    <p className="text-sm text-gray-700">
                                        Nascita: <strong>{formatDisplayDate(detail.birthDate)}</strong>
                                    </p>
                                    <p className="text-sm text-gray-700 mt-1">
                                        Morte: <strong>{formatDisplayDate(detail.deathDate)}</strong>
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                                        Ubicazione
                                    </p>
                                    <p className="text-sm text-gray-700 flex items-start gap-1.5">
                                        <MapPin size={14} className="text-[#c5a880] mt-0.5 shrink-0" />
                                        <span>
                                            {detail.cemeteryName || 'Cimitero'} — {detail.cemeteryCity}
                                            <br />
                                            Posizione: {detail.gravePosition || 'Non specificata'}
                                        </span>
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                                        Cronologia
                                    </p>
                                    <p className="text-sm text-gray-700">
                                        <strong>{detail.orders.length}</strong>{' '}
                                        {detail.orders.length === 1 ? 'ordine' : 'ordini'} ·{' '}
                                        <strong>{detail.linkedUsers.length}</strong>{' '}
                                        {detail.linkedUsers.length === 1 ? 'parente' : 'parenti'}
                                    </p>
                                </div>
                            </section>

                            {detail.kind === 'profile' ? (
                                <>
                                    <section className="rounded-xl border border-gray-100 p-5">
                                        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                                            <Users size={15} /> Parenti collegati
                                        </h3>
                                        {detail.linkedUsers.length === 0 ? (
                                            <p className="text-sm text-gray-400">Nessun utente collegato al profilo.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {detail.linkedUsers.map((u) => (
                                                    <div
                                                        key={u.id}
                                                        className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                                                    >
                                                        <p className="font-semibold text-gray-900 flex items-center gap-2">
                                                            <User size={14} className="text-gray-400" />
                                                            {u.name || 'Utente'}
                                                        </p>
                                                        <p className="text-xs text-gray-500 mt-1">{u.email}</p>
                                                        {u.phone ? (
                                                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                                                <Phone size={11} />
                                                                {u.phone}
                                                            </p>
                                                        ) : null}
                                                        {u.relationship ? (
                                                            <p className="text-[10px] uppercase tracking-wider text-[#c5a880] mt-2 font-bold">
                                                                {u.relationship}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    <section className="rounded-xl border border-gray-100 p-5">
                                        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                                            <Flower2 size={15} /> Fiorista custode (unico)
                                        </h3>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            <select
                                                value={selectedPartnerId}
                                                onChange={(e) => setSelectedPartnerId(e.target.value)}
                                                className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:ring-2 focus:ring-[#c5a880]/30 outline-none"
                                            >
                                                <option value="">Seleziona fiorista…</option>
                                                {partners.map((p) => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.shopName} — {p.ownerName}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                disabled={!selectedPartnerId || savingFlorist}
                                                onClick={handleSaveFlorist}
                                                className="rounded-lg bg-[#0f172a] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40"
                                            >
                                                {savingFlorist ? 'Salvataggio…' : 'Assegna fiorista'}
                                            </button>
                                        </div>
                                        {detail.floristName ? (
                                            <p className="text-xs text-gray-500 mt-2">
                                                Attuale: <strong>{detail.floristName}</strong>
                                            </p>
                                        ) : (
                                            <p className="text-xs text-gray-400 mt-2">Nessun fiorista assegnato.</p>
                                        )}
                                    </section>
                                </>
                            ) : null}

                            <section>
                                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                                    <Calendar size={15} /> Cronologia ordini e prove visive
                                </h3>
                                <div className="space-y-6">
                                    {detail.orders.map((order) => {
                                        const proof = getOrderProofPhotos(order);
                                        const lat = order.latitude ?? order.deliveryProof?.gpsLatitude;
                                        const lng = order.longitude ?? order.deliveryProof?.gpsLongitude;

                                        return (
                                            <div
                                                key={order.id}
                                                className="border border-gray-200 rounded-xl overflow-hidden shadow-sm"
                                            >
                                                <div className="bg-gray-50/80 px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500 block mb-1">
                                                            ORDINE #{order.orderNumber || order.id.slice(0, 8)}
                                                        </span>
                                                        <span className="font-semibold text-gray-900">
                                                            {orderStatusLabel(order.status)} ·{' '}
                                                            {formatDisplayDate(order.createdAt)}
                                                        </span>
                                                    </div>
                                                    {order.partner ? (
                                                        <span className="text-xs font-medium text-gray-600">
                                                            Fiorista ordine: {order.partner.shopName}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                    <div className="space-y-3 text-sm text-gray-600">
                                                        <p>
                                                            <strong>Consegna prevista:</strong>{' '}
                                                            {formatDisplayDate(order.deliveryDate)}
                                                        </p>
                                                        <p className="flex items-start gap-1.5">
                                                            <MapPin size={14} className="text-[#c5a880] mt-0.5 shrink-0" />
                                                            <span>
                                                                {order.cemeteryName}, {order.cemeteryCity}
                                                                <br />
                                                                Posizione: {order.gravePosition || 'Non specificata'}
                                                            </span>
                                                        </p>
                                                        {order.user ? (
                                                            <p>
                                                                <strong>Committente:</strong> {order.user.name || order.user.email}
                                                            </p>
                                                        ) : null}
                                                        {order.additionalInstructions ? (
                                                            <p className="text-xs bg-gray-50 rounded-lg p-3 border border-gray-100">
                                                                {order.additionalInstructions}
                                                            </p>
                                                        ) : null}
                                                        <ul className="text-xs space-y-1">
                                                            {order.items.map((item) => (
                                                                <li key={item.id}>
                                                                    {item.product.name} ×{item.quantity}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>

                                                    <CustodiedProofGallery
                                                        orderId={order.id}
                                                        deceasedName={order.deceasedName}
                                                        initialBefore={proof.before}
                                                        initialAfter={proof.after}
                                                        lat={lat}
                                                        lng={lng}
                                                        isAdmin
                                                        showGpsMap
                                                        compact
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
