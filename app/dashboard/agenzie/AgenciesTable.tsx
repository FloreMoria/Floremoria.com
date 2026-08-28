'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Plus, Pencil, ExternalLink, X, Check } from 'lucide-react';
import { ChannelBadge } from '@/components/dashboard/ChannelBadge';

export type FloristOption = {
    id: string;
    shopName: string;
    ownerName: string;
    province: string | null;
    coverageArea: string | null;
    isActive: boolean;
};

export type AgencyRow = {
    id: string;
    shopName: string;
    ownerName: string;
    province: string | null;
    coverageArea: string | null;
    address: string | null;
    uniqueCode: string | null;
    partnershipChannel: string | null;
    agencyNotificationEmail: string | null;
    aggregatorNotificationEmail: string | null;
    email: string | null;
    isActive: boolean;
    defaultFloristId: string | null;
    defaultFlorist: {
        id: string;
        shopName: string;
        province: string | null;
        coverageArea: string | null;
    } | null;
    ordersCount: number;
};

const CHANNEL_OPTIONS = [
    'Annunci Funebri (AF)',
    'Diretta (FloreMoria)',
    'Altro provider',
] as const;

type FormState = {
    id?: string;
    shopName: string;
    ownerName: string;
    province: string;
    coverageArea: string;
    uniqueCode: string;
    partnershipChannel: string;
    agencyNotificationEmail: string;
    aggregatorNotificationEmail: string;
    defaultFloristId: string;
    isActive: boolean;
};

const emptyForm = (): FormState => ({
    shopName: '',
    ownerName: '',
    province: '',
    coverageArea: '',
    uniqueCode: '',
    partnershipChannel: 'Diretta (FloreMoria)',
    agencyNotificationEmail: '',
    aggregatorNotificationEmail: 'assistenza@floremoria.com',
    defaultFloristId: '',
    isActive: true,
});

function cityLabel(a: AgencyRow): string {
    const parts = [a.coverageArea, a.province].filter(Boolean);
    return parts.length ? parts.join(' · ') : '—';
}

export default function AgenciesTable({
    initialAgencies,
    florists,
}: {
    initialAgencies: AgencyRow[];
    florists: FloristOption[];
}) {
    const [agencies, setAgencies] = useState(initialAgencies);
    const [filter, setFilter] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [saving, setSaving] = useState(false);

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3200);
    }, []);

    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return agencies;
        return agencies.filter((a) => {
            const hay = [
                a.shopName,
                a.ownerName,
                a.coverageArea,
                a.province,
                a.partnershipChannel,
                a.agencyNotificationEmail,
                a.uniqueCode,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [agencies, filter]);

    const openCreate = () => {
        setForm(emptyForm());
        setModalOpen(true);
    };

    const openEdit = (a: AgencyRow) => {
        setForm({
            id: a.id,
            shopName: a.shopName,
            ownerName: a.ownerName,
            province: a.province || '',
            coverageArea: a.coverageArea || '',
            uniqueCode: a.uniqueCode || '',
            partnershipChannel: a.partnershipChannel || 'Diretta (FloreMoria)',
            agencyNotificationEmail: a.agencyNotificationEmail || '',
            aggregatorNotificationEmail: a.aggregatorNotificationEmail || 'assistenza@floremoria.com',
            defaultFloristId: a.defaultFloristId || '',
            isActive: a.isActive,
        });
        setModalOpen(true);
    };

    const saveFlorist = async (agencyId: string, defaultFloristId: string) => {
        setBusyId(agencyId);
        try {
            const res = await fetch('/api/dashboard/agencies', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: agencyId,
                    defaultFloristId: defaultFloristId || null,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                showToast(json.error || 'Salvataggio fiorista fallito');
                return;
            }
            setAgencies((prev) =>
                prev.map((a) =>
                    a.id === agencyId
                        ? {
                              ...a,
                              defaultFloristId: json.agency.defaultFloristId,
                              defaultFlorist: json.agency.defaultFlorist,
                          }
                        : a
                )
            );
            showToast('Fiorista di riferimento aggiornato');
        } catch {
            showToast('Errore di rete');
        } finally {
            setBusyId(null);
        }
    };

    const submitForm = async () => {
        if (!form.shopName.trim()) {
            showToast('Nome agenzia obbligatorio');
            return;
        }
        setSaving(true);
        try {
            const isEdit = Boolean(form.id);
            const res = await fetch('/api/dashboard/agencies', {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...(isEdit ? { id: form.id } : {}),
                    shopName: form.shopName.trim(),
                    ownerName: form.ownerName.trim() || form.shopName.trim(),
                    province: form.province.trim().toUpperCase().slice(0, 2) || null,
                    coverageArea: form.coverageArea.trim() || null,
                    uniqueCode: form.uniqueCode.trim() || undefined,
                    partnershipChannel: form.partnershipChannel,
                    agencyNotificationEmail: form.agencyNotificationEmail.trim() || null,
                    aggregatorNotificationEmail:
                        form.aggregatorNotificationEmail.trim() || 'assistenza@floremoria.com',
                    defaultFloristId: form.defaultFloristId || null,
                    isActive: form.isActive,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                showToast(json.error || 'Salvataggio fallito');
                return;
            }
            const row: AgencyRow = {
                id: json.agency.id,
                shopName: json.agency.shopName,
                ownerName: json.agency.ownerName,
                province: json.agency.province,
                coverageArea: json.agency.coverageArea,
                address: json.agency.address,
                uniqueCode: json.agency.uniqueCode,
                partnershipChannel: json.agency.partnershipChannel,
                agencyNotificationEmail: json.agency.agencyNotificationEmail,
                aggregatorNotificationEmail: json.agency.aggregatorNotificationEmail,
                email: json.agency.email,
                isActive: json.agency.isActive,
                defaultFloristId: json.agency.defaultFloristId,
                defaultFlorist: json.agency.defaultFlorist,
                ordersCount: json.agency._count?.agencyOrders ?? (isEdit ? agencies.find((x) => x.id === form.id)?.ordersCount ?? 0 : 0),
            };
            setAgencies((prev) => {
                if (isEdit) return prev.map((a) => (a.id === row.id ? row : a));
                return [...prev, row].sort((a, b) => a.shopName.localeCompare(b.shopName, 'it'));
            });
            setModalOpen(false);
            showToast(isEdit ? 'Agenzia aggiornata' : 'Agenzia creata');
        } catch {
            showToast('Errore di rete');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {toast ? (
                <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-black text-white px-4 py-2.5 text-sm shadow-lg flex items-center gap-2">
                    <Check size={16} /> {toast}
                </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Cerca agenzia, città, canale…"
                    className="w-full sm:max-w-sm rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
                <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-black text-white px-4 py-2.5 text-sm font-semibold hover:bg-gray-900"
                >
                    <Plus size={16} /> Nuova agenzia
                </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
                            <th className="px-4 py-3 font-semibold">Agenzia</th>
                            <th className="px-4 py-3 font-semibold">Città / Prov.</th>
                            <th className="px-4 py-3 font-semibold">Canale</th>
                            <th className="px-4 py-3 font-semibold">Email agenzia</th>
                            <th className="px-4 py-3 font-semibold">Email aggregatore</th>
                            <th className="px-4 py-3 font-semibold min-w-[220px]">Fiorista di riferimento</th>
                            <th className="px-4 py-3 font-semibold">Ordini</th>
                            <th className="px-4 py-3 font-semibold" />
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                                    <Building2 className="mx-auto mb-2 opacity-40" size={28} />
                                    Nessuna agenzia funebre. Crea una partnership diretta o AF.
                                </td>
                            </tr>
                        ) : (
                            filtered.map((a) => (
                                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                                    <td className="px-4 py-3">
                                        <p className="font-semibold text-gray-900">{a.shopName}</p>
                                        <p className="text-xs text-gray-400">
                                            {a.uniqueCode || a.id.slice(0, 8)}
                                            {!a.isActive ? ' · inattiva' : ''}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-gray-700">{cityLabel(a)}</td>
                                    <td className="px-4 py-3">
                                        <ChannelBadge channel={a.partnershipChannel} />
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 text-xs">
                                        {a.agencyNotificationEmail || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 text-xs">
                                        {a.aggregatorNotificationEmail || 'assistenza@floremoria.com'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <select
                                            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:opacity-50"
                                            value={a.defaultFloristId || ''}
                                            disabled={busyId === a.id}
                                            onChange={(e) => void saveFlorist(a.id, e.target.value)}
                                        >
                                            <option value="">— Nessuno (fallback geografico) —</option>
                                            {florists.map((f) => (
                                                <option key={f.id} value={f.id}>
                                                    {f.shopName}
                                                    {f.province ? ` (${f.province})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/dashboard/orders?agencyId=${encodeURIComponent(a.id)}`}
                                            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-800 hover:underline"
                                        >
                                            {a.ordersCount} <ExternalLink size={12} />
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            type="button"
                                            onClick={() => openEdit(a)}
                                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
                                        >
                                            <Pencil size={12} /> Modifica
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {modalOpen ? (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-gray-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                            <h2 className="text-lg font-semibold text-gray-900">
                                {form.id ? 'Modifica agenzia' : 'Nuova agenzia funebre'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setModalOpen(false)}
                                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-3 px-5 py-4">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Nome agenzia *
                                <input
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"
                                    value={form.shopName}
                                    onChange={(e) => setForm((f) => ({ ...f, shopName: e.target.value }))}
                                />
                            </label>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Referente
                                <input
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"
                                    value={form.ownerName}
                                    onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    Città / Area
                                    <input
                                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"
                                        value={form.coverageArea}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, coverageArea: e.target.value }))
                                        }
                                    />
                                </label>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    Provincia
                                    <input
                                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900 uppercase"
                                        maxLength={2}
                                        value={form.province}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                province: e.target.value.toUpperCase().slice(0, 2),
                                            }))
                                        }
                                    />
                                </label>
                            </div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Canale partnership
                                <select
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"
                                    value={form.partnershipChannel}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, partnershipChannel: e.target.value }))
                                    }
                                >
                                    {CHANNEL_OPTIONS.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Codice agenzia (agencyCode)
                                <input
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"
                                    value={form.uniqueCode}
                                    onChange={(e) => setForm((f) => ({ ...f, uniqueCode: e.target.value }))}
                                    placeholder="Opzionale — generato se vuoto"
                                />
                            </label>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Email notifiche agenzia
                                <input
                                    type="email"
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"
                                    value={form.agencyNotificationEmail}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            agencyNotificationEmail: e.target.value,
                                        }))
                                    }
                                />
                            </label>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Email aggregatore / AF
                                <input
                                    type="email"
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"
                                    value={form.aggregatorNotificationEmail}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            aggregatorNotificationEmail: e.target.value,
                                        }))
                                    }
                                />
                            </label>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Fiorista di riferimento predefinito
                                <select
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"
                                    value={form.defaultFloristId}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, defaultFloristId: e.target.value }))
                                    }
                                >
                                    <option value="">— Nessuno —</option>
                                    {florists.map((f) => (
                                        <option key={f.id} value={f.id}>
                                            {f.shopName}
                                            {f.province ? ` (${f.province})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => setModalOpen(false)}
                                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Annulla
                            </button>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => void submitForm()}
                                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
                            >
                                {saving ? 'Salvataggio…' : 'Salva'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
