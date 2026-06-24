'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Search, ChevronRight, Plus, Heart, AlertTriangle } from 'lucide-react';
import DeceasedDetailModal from '@/components/dashboard/DeceasedDetailModal';
import type { DeceasedLeaderRow } from '@/lib/deceased/listDeceasedLeaderRows';

type PartnerOption = {
    id: string;
    shopName: string;
    ownerName: string;
};

function formatDisplayDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('it-IT');
}

export default function ClientDeceasedTable({
    initialRows,
    partners,
}: {
    initialRows: DeceasedLeaderRow[];
    partners: PartnerOption[];
}) {
    const router = useRouter();
    const [rows, setRows] = useState(initialRows);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRow, setSelectedRow] = useState<DeceasedLeaderRow | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    useEffect(() => {
        setRows(initialRows);
    }, [initialRows]);

    const filteredRows = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(
            (row) =>
                row.fullName.toLowerCase().includes(q) ||
                row.cemeteryCity.toLowerCase().includes(q) ||
                (row.cemeteryName || '').toLowerCase().includes(q) ||
                (row.gravePosition || '').toLowerCase().includes(q) ||
                (row.floristName || '').toLowerCase().includes(q)
        );
    }, [rows, searchTerm]);

    const handleCreateManual = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setCreating(true);
        setCreateError(null);
        const form = e.currentTarget;
        const fullName = (form.elements.namedItem('fullName') as HTMLInputElement).value;
        const cemeteryCity = (form.elements.namedItem('cemeteryCity') as HTMLInputElement).value;
        const cemeteryName = (form.elements.namedItem('cemeteryName') as HTMLInputElement).value;

        try {
            const res = await fetch('/api/dashboard/defunti', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create_manual',
                    fullName,
                    cemeteryCity,
                    cemeteryName: cemeteryName || null,
                }),
            });
            const data = (await res.json()) as { ok?: boolean; error?: string; deceasedProfileId?: string };
            if (!res.ok || !data.ok || !data.deceasedProfileId) {
                throw new Error(data.error || 'Creazione non riuscita.');
            }
            setShowCreateForm(false);
            form.reset();
            router.refresh();
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : 'Errore creazione.');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div>
            <div className="mb-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
                <div className="relative max-w-md flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Cerca per nome, comune, cimitero, posizione…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-[#c5a880] focus:ring-1 focus:ring-[#c5a880] outline-none transition-all"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => setShowCreateForm((v) => !v)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#c5a880]/40 bg-[#c5a880]/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#8a7349] hover:bg-[#c5a880]/15"
                >
                    <Plus size={14} />
                    Nuovo defunto
                </button>
            </div>

            {showCreateForm ? (
                <form
                    onSubmit={handleCreateManual}
                    className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-5 grid grid-cols-1 sm:grid-cols-3 gap-4"
                >
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Nome e cognome</label>
                        <input
                            name="fullName"
                            required
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Es. Luciano Mammì"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Comune</label>
                        <input
                            name="cemeteryCity"
                            required
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Es. Udine"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Cimitero</label>
                        <input
                            name="cemeteryName"
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Es. Cimitero di San Giovanni"
                        />
                    </div>
                    <div className="sm:col-span-3 flex items-center gap-3">
                        <button
                            type="submit"
                            disabled={creating}
                            className="rounded-lg bg-[#0f172a] px-5 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
                        >
                            {creating ? 'Salvataggio…' : 'Inserisci anagrafica'}
                        </button>
                        {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
                    </div>
                </form>
            ) : null}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[960px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                <th className="px-5 py-4">Defunto</th>
                                <th className="px-5 py-4">Nascita</th>
                                <th className="px-5 py-4">Morte</th>
                                <th className="px-5 py-4">Comune</th>
                                <th className="px-5 py-4">Cimitero</th>
                                <th className="px-5 py-4">Posizione tomba</th>
                                <th className="px-5 py-4">Ordini</th>
                                <th className="px-5 py-4">Fiorista</th>
                                <th className="px-5 py-4">Stato</th>
                                <th className="px-5 py-4 text-right"> </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredRows.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-6 py-10 text-center text-gray-400">
                                        Nessun defunto trovato.
                                    </td>
                                </tr>
                            ) : (
                                filteredRows.map((row) => (
                                    <tr
                                        key={row.rowKey}
                                        className={`hover:bg-gray-50/70 transition-colors cursor-pointer ${row.isOrphan ? 'bg-amber-50/30' : ''}`}
                                        onClick={() => setSelectedRow(row)}
                                    >
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                {row.photoUrl ? (
                                                    <Image
                                                        src={row.photoUrl}
                                                        alt={row.fullName}
                                                        width={36}
                                                        height={36}
                                                        className="w-9 h-9 rounded-full object-cover border border-gray-200"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className="w-9 h-9 rounded-full bg-[#EFEAE2] flex items-center justify-center text-[#8a7349]">
                                                        <Heart size={14} className="fill-current" />
                                                    </div>
                                                )}
                                                <span className="font-semibold text-gray-900">{row.fullName}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-gray-600">{formatDisplayDate(row.birthDate)}</td>
                                        <td className="px-5 py-4 text-sm text-gray-600">{formatDisplayDate(row.deathDate)}</td>
                                        <td className="px-5 py-4 text-sm text-gray-600">{row.cemeteryCity}</td>
                                        <td className="px-5 py-4 text-sm text-gray-600">{row.cemeteryName || '—'}</td>
                                        <td className="px-5 py-4 text-sm text-gray-600 max-w-[180px] truncate">
                                            {row.gravePosition || '—'}
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="inline-flex px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                                                {row.orderCount}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-gray-600">{row.floristName || '—'}</td>
                                        <td className="px-5 py-4">
                                            {row.isOrphan ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wide">
                                                    <AlertTriangle size={11} />
                                                    Orfano
                                                </span>
                                            ) : (
                                                <span className="inline-flex px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">
                                                    Registrato
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <ChevronRight className="w-5 h-5 text-gray-400 inline-block" />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedRow ? (
                <DeceasedDetailModal
                    row={selectedRow}
                    partners={partners}
                    onClose={() => setSelectedRow(null)}
                    onRegistered={() => {
                        setSelectedRow(null);
                        router.refresh();
                    }}
                />
            ) : null}
        </div>
    );
}
