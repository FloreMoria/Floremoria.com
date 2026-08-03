'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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
    Pencil,
    Trash2,
    Save,
    X,
    ImageIcon,
} from 'lucide-react';
import AdminMediaUploadAvatar from '@/components/dashboard/AdminMediaUploadAvatar';
import CustodiedProofGallery from '@/components/dashboard/CustodiedProofGallery';
import PlannedDeliveryDatesEditor from '@/components/dashboard/PlannedDeliveryDatesEditor';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';
import type { DeceasedDetailPayload } from '@/lib/deceased/getDeceasedDetail';
import type { DeceasedLeaderRow } from '@/lib/deceased/listDeceasedLeaderRows';
import {
    parseGravePosition,
    splitFullName,
    toDateInputValue,
} from '@/lib/deceased/deceasedProfileFormUtils';
import { sanitizePlannedDeliveryDates } from '@/lib/users/profileUserType';

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
    onDeleted?: (profileId: string) => void;
    onUpdated?: (detail: DeceasedDetailPayload) => void;
};

type EditForm = {
    firstName: string;
    lastName: string;
    phone: string;
    city: string;
    cemeteryName: string;
    cemeteryCity: string;
    graveSector: string;
    graveNumber: string;
    verifiedNotes: string;
    plannedDeliveryDates: string[];
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

function detailToForm(detail: DeceasedDetailPayload): EditForm {
    const { firstName, lastName } = splitFullName(detail.fullName);
    const grave = parseGravePosition(detail.gravePosition);
    return {
        firstName,
        lastName,
        phone: detail.phone || '',
        city: detail.city || detail.cemeteryCity || '',
        cemeteryName: detail.cemeteryName || '',
        cemeteryCity: detail.cemeteryCity || detail.city || '',
        graveSector: grave.graveSector,
        graveNumber: grave.graveNumber,
        verifiedNotes: detail.verifiedNotes || '',
        plannedDeliveryDates: sanitizePlannedDeliveryDates(detail.plannedDeliveryDates),
    };
}

export default function DeceasedProfileDrawer({
    row,
    partners,
    onClose,
    onRegistered,
    onDeleted,
    onUpdated,
}: Props) {
    const router = useRouter();
    const [detail, setDetail] = useState<DeceasedDetailPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [registering, setRegistering] = useState(false);
    const [savingFlorist, setSavingFlorist] = useState(false);
    const [selectedPartnerId, setSelectedPartnerId] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState<EditForm | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(null), 3200);
    };

    const loadDetail = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const fetchUrl = row.isOrphan
                ? `/api/dashboard/deceased/${encodeURIComponent(row.orphanSeedOrderId || 'seed')}?kind=orphan&seedOrderId=${encodeURIComponent(row.orphanSeedOrderId || '')}`
                : `/api/dashboard/deceased/${row.deceasedProfileId}`;

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
            setForm(detailToForm(data.detail));
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
            const res = await fetch('/api/dashboard/deceased', {
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
            showToast('Profilo registrato con successo');
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
            const res = await fetch(`/api/dashboard/deceased/${detail.deceasedProfileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set_florist', partnerId: selectedPartnerId }),
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
            showToast('Profilo aggiornato con successo');
            router.refresh();
            onUpdated?.(data.detail);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore salvataggio fiorista.');
        } finally {
            setSavingFlorist(false);
        }
    };

    const beginEdit = () => {
        if (!detail || detail.kind !== 'profile') return;
        setForm(detailToForm(detail));
        setEditMode(true);
        setError(null);
    };

    const cancelEdit = () => {
        if (detail) setForm(detailToForm(detail));
        setEditMode(false);
    };

    const saveProfile = async () => {
        if (!detail?.deceasedProfileId || !form) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/dashboard/deceased/${detail.deceasedProfileId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_profile',
                    firstName: form.firstName,
                    lastName: form.lastName,
                    phone: form.phone || null,
                    city: form.city || form.cemeteryCity,
                    cemeteryName: form.cemeteryName || null,
                    cemeteryCity: form.city || form.cemeteryCity,
                    graveSector: form.graveSector || null,
                    graveNumber: form.graveNumber || null,
                    verifiedNotes: form.verifiedNotes || null,
                    plannedDeliveryDates: sanitizePlannedDeliveryDates(form.plannedDeliveryDates),
                }),
            });
            const data = (await res.json()) as {
                ok?: boolean;
                error?: string;
                message?: string;
                detail?: DeceasedDetailPayload;
            };
            if (!res.ok || !data.ok || !data.detail) {
                throw new Error(data.error || 'Salvataggio non riuscito.');
            }
            setDetail(data.detail);
            setForm(detailToForm(data.detail));
            setEditMode(false);
            showToast(data.message || 'Profilo aggiornato con successo');
            router.refresh();
            onUpdated?.(data.detail);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore salvataggio.');
        } finally {
            setSaving(false);
        }
    };

    const deleteProfile = async () => {
        if (!detail?.deceasedProfileId) return;
        setDeleting(true);
        setError(null);
        try {
            const res = await fetch(`/api/dashboard/deceased/${detail.deceasedProfileId}`, {
                method: 'DELETE',
            });
            const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Eliminazione non riuscita.');
            }
            showToast(data.message || 'Profilo eliminato');
            const deletedId = detail.deceasedProfileId;
            setConfirmDelete(false);
            router.refresh();
            onDeleted?.(deletedId);
            window.setTimeout(() => onClose(), 400);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore eliminazione.');
        } finally {
            setDeleting(false);
        }
    };

    const displayName = detail?.fullName || row.fullName;

    return (
        <div
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
            onClick={onClose}
        >
            {toast ? (
                <div className="fixed top-6 right-6 z-[60] rounded-xl bg-[#0f172a] text-white px-4 py-3 text-sm font-medium shadow-lg">
                    {toast}
                </div>
            ) : null}

            <div
                className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {detail?.coverUrl ? (
                    <div className="relative h-28 sm:h-36 w-full bg-gray-100">
                        <Image
                            src={detail.coverUrl}
                            alt={`Copertina ${displayName}`}
                            fill
                            className="object-cover"
                            unoptimized
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    </div>
                ) : null}

                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAF9F6]">
                    <div className="flex items-center gap-5">
                        {row.deceasedProfileId ? (
                            <AdminMediaUploadAvatar
                                imageUrl={detail?.photoUrl ?? row.photoUrl}
                                fallbackLabel={displayName}
                                entity="deceased"
                                entityId={row.deceasedProfileId}
                                onUploaded={(url) => {
                                    setDetail((prev) => (prev ? { ...prev, photoUrl: url } : prev));
                                    showToast('Foto profilo aggiornata');
                                }}
                            />
                        ) : (
                            <div className="w-20 h-20 rounded-full bg-[#EFEAE2] flex items-center justify-center border-4 border-white shadow-md">
                                <Heart size={28} className="text-red-400 fill-red-400" />
                            </div>
                        )}
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a880] mb-1">
                                {detail?.kind === 'orphan'
                                    ? 'Scheda orfana — da registrare'
                                    : 'Scheda defunto registrato'}
                            </p>
                            <h2 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
                                <Heart size={18} className="text-red-500 fill-red-500" />
                                {displayName}
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                {detail?.cemeteryName || row.cemeteryName || 'Cimitero'} ·{' '}
                                {detail?.cemeteryCity || row.cemeteryCity}
                                {(detail?.gravePosition || row.gravePosition)
                                    ? ` · ${detail?.gravePosition || row.gravePosition}`
                                    : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {detail?.kind === 'profile' && !editMode ? (
                            <>
                                <button
                                    type="button"
                                    onClick={beginEdit}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-700 hover:border-[#c5a880]"
                                >
                                    <Pencil size={13} /> Modifica
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmDelete(true)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-red-700 hover:bg-red-100"
                                >
                                    <Trash2 size={13} /> Elimina
                                </button>
                            </>
                        ) : null}
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
                            aria-label="Chiudi"
                        >
                            <X size={18} />
                        </button>
                    </div>
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
                            {editMode && form ? (
                                <section className="space-y-4 bg-gray-50/80 p-5 rounded-2xl border border-gray-200/80">
                                    <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                                        <h3 className="font-display font-semibold text-sm text-gray-900">
                                            Modifica anagrafica defunto
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setEditMode(false)}
                                                className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900"
                                            >
                                                Annulla
                                            </button>
                                            <button
                                                type="button"
                                                onClick={saveProfile}
                                                disabled={saving}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                                            >
                                                {saving ? (
                                                    <Loader2 size={13} className="animate-spin" />
                                                ) : (
                                                    <Save size={13} />
                                                )}
                                                Salva
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Nome
                                            <input
                                                value={form.firstName}
                                                onChange={(e) =>
                                                    setForm((f) => (f ? { ...f, firstName: e.target.value } : f))
                                                }
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Cognome
                                            <input
                                                value={form.lastName}
                                                onChange={(e) =>
                                                    setForm((f) => (f ? { ...f, lastName: e.target.value } : f))
                                                }
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Numero di telefono
                                            <input
                                                type="tel"
                                                value={form.phone}
                                                onChange={(e) =>
                                                    setForm((f) => (f ? { ...f, phone: e.target.value } : f))
                                                }
                                                placeholder="Es. +39 333 1234567"
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Città / Comune
                                            <input
                                                value={form.city}
                                                onChange={(e) =>
                                                    setForm((f) => (f ? { ...f, city: e.target.value, cemeteryCity: e.target.value } : f))
                                                }
                                                required
                                                placeholder="Es. Bergamo"
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500 sm:col-span-2">
                                            Cimitero di sepoltura
                                            <input
                                                value={form.cemeteryName}
                                                onChange={(e) =>
                                                    setForm((f) => (f ? { ...f, cemeteryName: e.target.value } : f))
                                                }
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Blocco / Settore
                                            <input
                                                value={form.graveSector}
                                                onChange={(e) =>
                                                    setForm((f) => (f ? { ...f, graveSector: e.target.value } : f))
                                                }
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Numero Loculo / Tomba
                                            <input
                                                value={form.graveNumber}
                                                onChange={(e) =>
                                                    setForm((f) => (f ? { ...f, graveNumber: e.target.value } : f))
                                                }
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
                                            />
                                        </label>
                                    </div>
                                    <label className="block text-xs font-semibold text-gray-500">
                                        Frase commemorativa
                                        <textarea
                                            value={form.verifiedNotes}
                                            onChange={(e) =>
                                                setForm((f) => (f ? { ...f, verifiedNotes: e.target.value } : f))
                                            }
                                            rows={3}
                                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
                                        />
                                    </label>
                                    <div className="rounded-xl border border-gray-100 bg-white p-4">
                                        <PlannedDeliveryDatesEditor
                                            dates={form.plannedDeliveryDates}
                                            onChange={(dates) =>
                                                setForm((f) => (f ? { ...f, plannedDeliveryDates: dates } : f))
                                            }
                                            disabled={saving}
                                            showNoCommitmentBanner={
                                                !detail.linkedUsers.some((u) => u.userType === 'SUBSCRIBER')
                                            }
                                        />
                                    </div>
                                </section>
                            ) : (
                                <>
                                    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                                                Contatto & Città
                                            </p>
                                            <p className="text-sm text-gray-700">
                                                Telefono: <strong>{detail.phone || '—'}</strong>
                                            </p>
                                            <p className="text-sm text-gray-700 mt-1">
                                                Città: <strong>{detail.city || detail.cemeteryCity || '—'}</strong>
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

                                    {(detail.plannedDeliveryDates?.length ?? 0) > 0 ? (
                                        <section className="rounded-xl border border-amber-100 bg-amber-50/60 p-5">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700/80 mb-2 flex items-center gap-1.5">
                                                <Calendar size={12} /> Date future (senza impegno)
                                            </p>
                                            <ul className="flex flex-wrap gap-2">
                                                {detail.plannedDeliveryDates.map((d) => (
                                                    <li
                                                        key={d}
                                                        className="rounded-full bg-white border border-amber-200 px-3 py-1 text-sm font-medium text-amber-950"
                                                    >
                                                        {formatDisplayDate(d)}
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    ) : null}

                                    {detail.verifiedNotes ? (
                                        <section className="rounded-xl border border-gray-100 bg-[#FAF9F6] p-5">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                                                Dedica
                                            </p>
                                            <p className="text-sm text-gray-700 italic leading-relaxed">
                                                “{detail.verifiedNotes}”
                                            </p>
                                        </section>
                                    ) : null}
                                </>
                            )}

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
                                                            <MapPin
                                                                size={14}
                                                                className="text-[#c5a880] mt-0.5 shrink-0"
                                                            />
                                                            <span>
                                                                {order.cemeteryName}, {order.cemeteryCity}
                                                                <br />
                                                                Posizione: {order.gravePosition || 'Non specificata'}
                                                            </span>
                                                        </p>
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
                                                        hasPreDeliveryPhotoOpt={order.items.some(
                                                            (item) => item.productId === 'florem-foto-stato-prima'
                                                        )}
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

            {confirmDelete ? (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !deleting && setConfirmDelete(false)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-display font-bold text-gray-900">
                            Eliminare il profilo?
                        </h3>
                        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                            Stai per eliminare l&apos;anagrafica di <strong>{displayName}</strong>. Gli ordini
                            restano in archivio ma verranno scollegati da questo profilo. I collegamenti con
                            parenti e fiorista verranno rimossi. L&apos;azione non è annullabile.
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                disabled={deleting}
                                onClick={() => setConfirmDelete(false)}
                                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-600"
                            >
                                Annulla
                            </button>
                            <button
                                type="button"
                                disabled={deleting}
                                onClick={deleteProfile}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
                            >
                                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                Conferma eliminazione
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
