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
import PhoneInput from '@/components/ui/PhoneInput';
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
    city: string;
    cemeteryName: string;
    cemeteryCity: string;
    graveSector: string;
    graveNumber: string;
    birthDate: string;
    deathDate: string;
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
        city: detail.city || detail.cemeteryCity || '',
        cemeteryName: detail.cemeteryName || '',
        cemeteryCity: detail.cemeteryCity || detail.city || '',
        graveSector: grave.graveSector,
        graveNumber: grave.graveNumber,
        birthDate: toDateInputValue(detail.birthDate),
        deathDate: toDateInputValue(detail.deathDate),
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
                    city: form.city || form.cemeteryCity,
                    cemeteryName: form.cemeteryName || null,
                    cemeteryCity: form.city || form.cemeteryCity,
                    graveSector: form.graveSector || null,
                    graveNumber: form.graveNumber || null,
                    birthDate: form.birthDate || null,
                    deathDate: form.deathDate || null,
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

    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editingUserName, setEditingUserName] = useState('');
    const [updatingUser, setUpdatingUser] = useState(false);

    const handleUpdateUserName = async (userId: string) => {
        if (!detail?.deceasedProfileId || !editingUserName.trim()) return;
        setUpdatingUser(true);
        try {
            const res = await fetch(`/api/dashboard/deceased/${detail.deceasedProfileId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_user_name',
                    userId,
                    name: editingUserName.trim(),
                }),
            });
            const data = await res.json();
            if (data.ok && data.detail) {
                setDetail(data.detail);
                showToast('Nome e Cognome utente aggiornato');
                router.refresh();
                onUpdated?.(data.detail);
            } else {
                alert(data.error || 'Errore durante l\'aggiornamento del nome.');
            }
        } catch {
            alert('Errore di rete.');
        } finally {
            setUpdatingUser(false);
            setEditingUserId(null);
        }
    };

    const handleUnlinkUser = async (userId: string) => {
        if (!detail?.deceasedProfileId) return;
        if (!window.confirm('Vuoi davvero scollegare questo utente dal profilo del defunto?')) return;
        try {
            const res = await fetch(`/api/dashboard/deceased/${detail.deceasedProfileId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'unlink_user',
                    userId,
                }),
            });
            const data = await res.json();
            if (data.ok && data.detail) {
                setDetail(data.detail);
                showToast('Utente scollegato.');
                router.refresh();
                onUpdated?.(data.detail);
            } else {
                alert(data.error || 'Errore durante lo scollegamento.');
            }
        } catch {
            alert('Errore di rete.');
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
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 flex justify-end">
            <div className="w-full max-w-2xl bg-white h-full shadow-2xl overflow-y-auto flex flex-col custom-scrollbar">
                {/* Header */}
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <AdminMediaUploadAvatar
                            imageUrl={detail?.photoUrl ?? null}
                            fallbackLabel={displayName}
                            entity="deceased"
                            entityId={detail?.deceasedProfileId || undefined}
                            onUploaded={(url) => {
                                setDetail((prev) => (prev ? { ...prev, photoUrl: url } : prev));
                                showToast('Foto profilo aggiornata');
                                router.refresh();
                            }}
                        />
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                                {row.isOrphan ? 'Scheda Defunto non registrata' : 'Scheda Defunto'}
                            </div>
                            <h2 className="text-lg font-display font-bold text-gray-900 flex items-center gap-2">
                                {displayName}
                            </h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {detail?.kind === 'profile' && !editMode ? (
                            <button
                                type="button"
                                onClick={beginEdit}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                <Pencil size={13} /> Modifica
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 p-4 space-y-4 overflow-y-auto custom-scrollbar">
                    {toast ? (
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800">
                            {toast}
                        </div>
                    ) : null}
                    {error ? (
                        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-800 flex items-center gap-2">
                            <AlertCircle size={14} /> {error}
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                            <Loader2 className="animate-spin" size={20} /> Caricamento scheda defunto...
                        </div>
                    ) : detail ? (
                        <>
                            {editMode && form ? (
                                <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">
                                            Modifica Anagrafica Defunto
                                        </h3>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={cancelEdit}
                                                className="px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                                            >
                                                Annulla
                                            </button>
                                            <button
                                                type="button"
                                                onClick={saveProfile}
                                                disabled={saving}
                                                className="inline-flex items-center gap-1 rounded-lg bg-black px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                                            >
                                                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salva
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Nome
                                            <input
                                                value={form.firstName}
                                                onChange={(e) => setForm((f) => (f ? { ...f, firstName: e.target.value } : f))}
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Cognome
                                            <input
                                                value={form.lastName}
                                                onChange={(e) => setForm((f) => (f ? { ...f, lastName: e.target.value } : f))}
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Città / Comune
                                            <input
                                                value={form.city}
                                                onChange={(e) => setForm((f) => (f ? { ...f, city: e.target.value, cemeteryCity: e.target.value } : f))}
                                                required
                                                placeholder="Es. Bergamo"
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Cimitero di sepoltura
                                            <input
                                                value={form.cemeteryName}
                                                onChange={(e) => setForm((f) => (f ? { ...f, cemeteryName: e.target.value } : f))}
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Blocco / Settore
                                            <input
                                                value={form.graveSector}
                                                onChange={(e) => setForm((f) => (f ? { ...f, graveSector: e.target.value } : f))}
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Numero Loculo / Tomba
                                            <input
                                                value={form.graveNumber}
                                                onChange={(e) => setForm((f) => (f ? { ...f, graveNumber: e.target.value } : f))}
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Data di nascita
                                            <input
                                                type="date"
                                                value={form.birthDate}
                                                onChange={(e) => setForm((f) => (f ? { ...f, birthDate: e.target.value } : f))}
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                                            />
                                        </label>
                                        <label className="block text-xs font-semibold text-gray-500">
                                            Data di morte / commemorazione
                                            <input
                                                type="date"
                                                value={form.deathDate}
                                                onChange={(e) => setForm((f) => (f ? { ...f, deathDate: e.target.value } : f))}
                                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                                            />
                                        </label>
                                    </div>
                                    <label className="block text-xs font-semibold text-gray-500">
                                        Frase commemorativa
                                        <textarea
                                            value={form.verifiedNotes}
                                            onChange={(e) => setForm((f) => (f ? { ...f, verifiedNotes: e.target.value } : f))}
                                            rows={2}
                                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                                        />
                                    </label>
                                </section>
                            ) : (
                                <>
                                    <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                                                Ubicazione Sepoltura
                                            </p>
                                            <p className="text-xs text-gray-700 flex items-start gap-1.5">
                                                <MapPin size={13} className="text-[#c5a880] mt-0.5 shrink-0" />
                                                <span>
                                                    <strong>{detail.cemeteryName || 'Cimitero'}</strong> — {detail.cemeteryCity}
                                                    <br />
                                                    Posizione: {detail.gravePosition || 'Non specificata'}
                                                </span>
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                                                Date Anagrafiche
                                            </p>
                                            <p className="text-xs text-gray-700">
                                                Nascita: <strong>{formatDisplayDate(detail.birthDate)}</strong> · Morte: <strong>{formatDisplayDate(detail.deathDate)}</strong>
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                <strong>{detail.orders.length}</strong> ordini · <strong>{detail.linkedUsers.length}</strong> parenti
                                            </p>
                                        </div>
                                    </section>
                                </>
                            )}

                            {detail.kind === 'profile' ? (
                                <>
                                    {/* UTENTI COLLEGATI (Nome e Cognome Editabile, SENZA EMAIL) */}
                                    <section className="rounded-xl border border-gray-100 p-4 bg-white shadow-sm space-y-3">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                            <Users size={14} className="text-[#c5a880]" /> Utente / Parenti Associati
                                        </h3>
                                        {detail.linkedUsers.length === 0 ? (
                                            <p className="text-xs text-gray-400">Nessun utente collegato a questa scheda defunto.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {detail.linkedUsers.map((u) => (
                                                    <div
                                                        key={u.id}
                                                        className="rounded-lg border border-gray-100 bg-gray-50 p-3 flex flex-col justify-between gap-2"
                                                    >
                                                        {editingUserId === u.id ? (
                                                            <div className="space-y-2">
                                                                <label className="block text-[10px] font-semibold text-gray-500 uppercase">
                                                                    Nome e Cognome Utente
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    value={editingUserName}
                                                                    onChange={(e) => setEditingUserName(e.target.value)}
                                                                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-black outline-none bg-white font-semibold text-gray-900"
                                                                    placeholder="Nome e Cognome..."
                                                                />
                                                                <div className="flex gap-2 justify-end">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setEditingUserId(null)}
                                                                        className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
                                                                    >
                                                                        Annulla
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={updatingUser}
                                                                        onClick={() => handleUpdateUserName(u.id)}
                                                                        className="px-3 py-1 text-xs font-bold bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
                                                                    >
                                                                        Salva
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div>
                                                                    <div className="font-semibold text-gray-900 text-sm flex items-center justify-between gap-2">
                                                                        <span className="flex items-center gap-1.5">
                                                                            <User size={14} className="text-[#c5a880] shrink-0" />
                                                                            {u.name?.trim() ? u.name : 'Nome e Cognome non specificati'}
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setEditingUserId(u.id);
                                                                                setEditingUserName(u.name || '');
                                                                            }}
                                                                            className="p-1 text-gray-400 hover:text-black hover:bg-gray-100 rounded transition-colors"
                                                                            title="Modifica Nome e Cognome"
                                                                        >
                                                                            <Pencil size={13} />
                                                                        </button>
                                                                    </div>
                                                                    {u.relationship ? (
                                                                        <p className="text-[10px] uppercase tracking-wider text-[#c5a880] mt-1 font-bold">
                                                                            Grado: {u.relationship}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                                <div className="flex justify-end pt-1 border-t border-gray-200/50">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleUnlinkUser(u.id)}
                                                                        className="text-[11px] text-red-600 hover:text-red-800 hover:underline font-medium"
                                                                    >
                                                                        Scollega Utente
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    <section className="rounded-xl border border-gray-100 p-4 bg-white shadow-sm">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                                            <Flower2 size={14} className="text-fm-gold" /> Fiorista custode (unico)
                                        </h3>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <select
                                                value={selectedPartnerId}
                                                onChange={(e) => setSelectedPartnerId(e.target.value)}
                                                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-800 bg-white focus:ring-2 focus:ring-[#c5a880]/30 outline-none"
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
                                                className="rounded-lg bg-[#0f172a] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40"
                                            >
                                                {savingFlorist ? 'Salvataggio…' : 'Assegna fiorista'}
                                            </button>
                                        </div>
                                    </section>
                                </>
                            ) : null}

                            <section className="space-y-3">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                    <Calendar size={14} /> Cronologia ordini e prove visive
                                </h3>
                                <div className="space-y-4">
                                    {detail.orders.map((order) => {
                                        const proof = getOrderProofPhotos(order);
                                        const lat = order.latitude ?? order.deliveryProof?.gpsLatitude;
                                        const lng = order.longitude ?? order.deliveryProof?.gpsLongitude;

                                        return (
                                            <div
                                                key={order.id}
                                                className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white"
                                            >
                                                <div className="bg-gray-50/80 px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-0.5">
                                                            ORDINE #{order.orderNumber || order.id.slice(0, 8)}
                                                        </span>
                                                        <span className="font-semibold text-gray-900 text-xs">
                                                            {orderStatusLabel(order.status)} · {formatDisplayDate(order.createdAt)}
                                                        </span>
                                                    </div>
                                                    {order.partner ? (
                                                        <span className="text-xs font-medium text-gray-600">
                                                            Fiorista: {order.partner.shopName}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                    <div className="space-y-2 text-xs text-gray-600">
                                                        <p>
                                                            <strong>Consegna prevista:</strong> {formatDisplayDate(order.deliveryDate)}
                                                        </p>
                                                        <p className="flex items-start gap-1">
                                                            <MapPin size={13} className="text-[#c5a880] mt-0.5 shrink-0" />
                                                            <span>
                                                                {order.cemeteryName}, {order.cemeteryCity}
                                                            </span>
                                                        </p>
                                                    </div>

                                                    {(proof.before.length > 0 || proof.after.length > 0) && (
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
                                                    )}
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

