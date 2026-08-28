'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Search, ChevronRight, Plus, Heart, AlertTriangle, GitMerge, Loader2 } from 'lucide-react';
import DeceasedProfileDrawer from '@/components/dashboard/DeceasedProfileDrawer';
import type { DeceasedLeaderRow } from '@/lib/deceased/listDeceasedLeaderRows';
import { compareByRecentActivity } from '@/lib/dashboard/sortDashboardLists';

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
    const [isMerging, setIsMerging] = useState(false);
    const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
    const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [rowDrafts, setRowDrafts] = useState<
        Record<string, { fullName: string; cemeteryCity: string; cemeteryName: string }>
    >({});

    const showToast = (message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(null), 3200);
    };

    const handleAutoMerge = async () => {
        const ok = window.confirm(
            'Avviare la deduplicazione automatica dei profili omonimi (es. "Santo Sancono", "Tusa Salvatore") e dei relativi ordini?'
        );
        if (!ok) return;

        setIsMerging(true);
        try {
            const res = await fetch('/api/dashboard/defunti/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autoScan: true }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Errore durante la deduplicazione.');
            }

            if (data.clustersMergedCount > 0) {
                showToast(`✅ Uniti con successo ${data.clustersMergedCount} cluster omonimi duplicati!`);
            } else {
                showToast('Nessun profilo omonimo duplicato da unire.');
            }
            router.refresh();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Errore deduplicazione.');
        } finally {
            setIsMerging(false);
        }
    };


    useEffect(() => {
        setRows(initialRows);
    }, [initialRows]);

    const filteredRows = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const base = q
            ? rows.filter(
                  (row) =>
                      row.fullName.toLowerCase().includes(q) ||
                      row.cemeteryCity.toLowerCase().includes(q) ||
                      (row.cemeteryName || '').toLowerCase().includes(q) ||
                      (row.gravePosition || '').toLowerCase().includes(q) ||
                      (row.floristName || '').toLowerCase().includes(q)
              )
            : rows;
        return [...base].sort((a, b) =>
            compareByRecentActivity(
                { updatedAt: a.updatedAt, createdAt: a.updatedAt },
                { updatedAt: b.updatedAt, createdAt: b.updatedAt }
            )
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
            const res = await fetch('/api/dashboard/deceased', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create_manual',
                    fullName,
                    cemeteryCity,
                    cemeteryName: cemeteryName || null,
                }),
            });
            const data = (await res.json()) as {
                ok?: boolean;
                error?: string;
                deceasedProfileId?: string;
                message?: string;
            };
            if (!res.ok || !data.ok || !data.deceasedProfileId) {
                throw new Error(data.error || 'Creazione non riuscita.');
            }
            setShowCreateForm(false);
            form.reset();
            showToast(data.message || 'Profilo creato con successo');
            router.refresh();
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : 'Errore creazione.');
        } finally {
            setCreating(false);
        }
    };

    const beginRowEdit = (row: DeceasedLeaderRow) => {
        if (!row.deceasedProfileId || row.isOrphan) return;
        setEditingRowKey(row.rowKey);
        setRowDrafts((prev) => ({
            ...prev,
            [row.rowKey]: {
                fullName: row.fullName,
                cemeteryCity: row.cemeteryCity,
                cemeteryName: row.cemeteryName || '',
            },
        }));
    };

    const cancelRowEdit = () => {
        setEditingRowKey(null);
    };

    const saveRowEdit = async (row: DeceasedLeaderRow) => {
        if (!row.deceasedProfileId || row.isOrphan) return;
        const draft = rowDrafts[row.rowKey];
        if (!draft) return;

        setSavingRowKey(row.rowKey);
        try {
            const res = await fetch(`/api/dashboard/deceased/${row.deceasedProfileId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_profile',
                    fullName: draft.fullName,
                    cemeteryCity: draft.cemeteryCity,
                    cemeteryName: draft.cemeteryName || null,
                }),
            });
            const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Salvataggio non riuscito.');
            }
            showToast(data.message || 'Profilo aggiornato con successo');

            setRows((prev) =>
                prev.map((r) =>
                    r.rowKey === row.rowKey
                        ? {
                            ...r,
                            fullName: draft.fullName,
                            cemeteryCity: draft.cemeteryCity,
                            cemeteryName: draft.cemeteryName || null,
                        }
                        : r
                )
            );

            if (selectedRow?.rowKey === row.rowKey) {
                setSelectedRow((prev) =>
                    prev
                        ? {
                            ...prev,
                            fullName: draft.fullName,
                            cemeteryCity: draft.cemeteryCity,
                            cemeteryName: draft.cemeteryName || null,
                        }
                        : prev
                );
            }

            setEditingRowKey(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Errore salvataggio defunto.');
        } finally {
            setSavingRowKey(null);
        }
    };

    const deleteRow = async (row: DeceasedLeaderRow) => {
        if (!row.deceasedProfileId || row.isOrphan) {
            alert('I gruppi orfani non si cancellano da qui: vanno prima registrati o gestiti dagli ordini.');
            return;
        }
        const ok = window.confirm(`Confermi cancellazione anagrafica di ${row.fullName}?`);
        if (!ok) return;

        try {
            const res = await fetch(`/api/dashboard/deceased/${row.deceasedProfileId}`, {
                method: 'DELETE',
            });
            const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Cancellazione non riuscita.');
            }
            setRows((prev) => prev.filter((r) => r.rowKey !== row.rowKey));
            if (selectedRow?.rowKey === row.rowKey) setSelectedRow(null);
            showToast(data.message || 'Profilo eliminato');
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Errore cancellazione defunto.');
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
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleAutoMerge}
                        disabled={isMerging}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-purple-800 hover:bg-purple-100 disabled:opacity-50 transition-colors"
                        title="Unisci automaticamente i profili omonimi duplicati e gli ordini storici"
                    >
                        {isMerging ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />}
                        {isMerging ? 'Unione in corso…' : 'Unisci Duplicati'}
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowCreateForm((v) => !v)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#c5a880]/40 bg-[#c5a880]/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#8a7349] hover:bg-[#c5a880]/15"
                    >
                        <Plus size={14} />
                        Nuovo defunto
                    </button>
                </div>

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
                <div className="dashboard-table-scroll overflow-x-auto sm:overflow-x-visible">
                    <table className="w-full text-left border-collapse table-fixed text-xs">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                <th className="px-2 py-2.5 w-[20%]">Defunto</th>
                                <th className="px-2 py-2.5 w-[8%] hidden md:table-cell">Nascita</th>
                                <th className="px-2 py-2.5 w-[8%] hidden md:table-cell">Morte</th>
                                <th className="px-2 py-2.5 w-[14%]">Comune</th>
                                <th className="px-2 py-2.5 w-[15%] hidden lg:table-cell">Cimitero</th>
                                <th className="px-2 py-2.5 w-[13%] hidden lg:table-cell">Posizione tomba</th>
                                <th className="px-2 py-2.5 w-[6%] text-center">Ordini</th>
                                <th className="px-2 py-2.5 w-[10%] hidden md:table-cell">Fiorista</th>
                                <th className="px-2 py-2.5 w-[8%]">Stato</th>
                                <th className="px-2 py-2.5 w-[10%] text-right"> </th>
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
                                        <td className="px-2 py-2 overflow-hidden">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {row.photoUrl ? (
                                                    <Image
                                                        src={row.photoUrl}
                                                        alt={row.fullName}
                                                        width={28}
                                                        height={28}
                                                        className="w-7 h-7 rounded-full object-cover border border-gray-200 shrink-0"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className="w-7 h-7 rounded-full bg-[#EFEAE2] flex items-center justify-center text-[#8a7349] shrink-0">
                                                        <Heart size={12} className="fill-current" />
                                                    </div>
                                                )}
                                                {editingRowKey === row.rowKey ? (
                                                    <input
                                                        value={rowDrafts[row.rowKey]?.fullName || ''}
                                                        onChange={(e) =>
                                                            setRowDrafts((prev) => ({
                                                                ...prev,
                                                                [row.rowKey]: {
                                                                    ...(prev[row.rowKey] || {
                                                                        fullName: '',
                                                                        cemeteryCity: '',
                                                                        cemeteryName: '',
                                                                    }),
                                                                    fullName: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="border border-gray-200 rounded px-1.5 py-0.5 text-xs w-full"
                                                    />
                                                ) : (
                                                    <span className="font-semibold text-gray-900 truncate block text-xs sm:text-sm" title={row.fullName}>
                                                        {row.fullName}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 text-xs text-gray-600 hidden md:table-cell truncate" title={formatDisplayDate(row.birthDate)}>
                                            {formatDisplayDate(row.birthDate)}
                                        </td>
                                        <td className="px-2 py-2 text-xs text-gray-600 hidden md:table-cell truncate" title={formatDisplayDate(row.deathDate)}>
                                            {formatDisplayDate(row.deathDate)}
                                        </td>
                                        <td className="px-2 py-2 text-xs text-gray-600 overflow-hidden">
                                            {editingRowKey === row.rowKey ? (
                                                <input
                                                    value={rowDrafts[row.rowKey]?.cemeteryCity || ''}
                                                    onChange={(e) =>
                                                        setRowDrafts((prev) => ({
                                                            ...prev,
                                                            [row.rowKey]: {
                                                                ...(prev[row.rowKey] || {
                                                                    fullName: '',
                                                                    cemeteryCity: '',
                                                                    cemeteryName: '',
                                                                }),
                                                                cemeteryCity: e.target.value,
                                                            },
                                                        }))
                                                    }
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="border border-gray-200 rounded px-1.5 py-0.5 text-xs w-full"
                                                />
                                            ) : (
                                                <span className="truncate block" title={row.cemeteryCity}>
                                                    {row.cemeteryCity}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2 text-xs text-gray-600 hidden lg:table-cell overflow-hidden">
                                            {editingRowKey === row.rowKey ? (
                                                <input
                                                    value={rowDrafts[row.rowKey]?.cemeteryName || ''}
                                                    onChange={(e) =>
                                                        setRowDrafts((prev) => ({
                                                            ...prev,
                                                            [row.rowKey]: {
                                                                ...(prev[row.rowKey] || {
                                                                    fullName: '',
                                                                    cemeteryCity: '',
                                                                    cemeteryName: '',
                                                                }),
                                                                cemeteryName: e.target.value,
                                                            },
                                                        }))
                                                    }
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="border border-gray-200 rounded px-1.5 py-0.5 text-xs w-full"
                                                />
                                            ) : (
                                                <span className="truncate block" title={row.cemeteryName || '—'}>
                                                    {row.cemeteryName || '—'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2 text-xs text-gray-600 hidden lg:table-cell overflow-hidden">
                                            <span className="truncate block" title={row.gravePosition || '—'}>
                                                {row.gravePosition || '—'}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold">
                                                {row.orderCount}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2 text-xs text-gray-600 hidden md:table-cell overflow-hidden">
                                            <span className="truncate block" title={row.floristName || '—'}>
                                                {row.floristName || '—'}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2">
                                            {row.isOrphan ? (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap"
                                                    title="Orfano (creato da ordine senza profilo)"
                                                >
                                                    <AlertTriangle size={10} />
                                                    Orfano
                                                </span>
                                            ) : (
                                                <span
                                                    className="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap"
                                                    title="Profilo registrato"
                                                >
                                                    Registrato
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2 text-right">
                                            <div className="inline-flex items-center justify-end gap-1">
                                                {editingRowKey === row.rowKey ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                void saveRowEdit(row);
                                                            }}
                                                            disabled={savingRowKey === row.rowKey}
                                                            className="px-2 py-1 text-[11px] font-semibold rounded bg-black text-white hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            Salva
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                cancelRowEdit();
                                                            }}
                                                            className="px-2 py-1 text-[11px] font-semibold rounded border border-gray-200 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                                                        >
                                                            Annulla
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            title="Modifica anagrafica defunto"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                beginRowEdit(row);
                                                            }}
                                                            disabled={row.isOrphan || !row.deceasedProfileId}
                                                            className="px-2 py-1 text-[11px] font-semibold rounded border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
                                                        >
                                                            Modifica
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="Cancella defunto"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                void deleteRow(row);
                                                            }}
                                                            disabled={row.isOrphan || !row.deceasedProfileId}
                                                            className="px-2 py-1 text-[11px] font-semibold rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40 whitespace-nowrap"
                                                        >
                                                            Cancella
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="Apri scheda dettagliata"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedRow(row);
                                                            }}
                                                            className="p-1 rounded text-gray-400 hover:text-gray-700 shrink-0"
                                                        >
                                                            <ChevronRight className="w-4 h-4 inline-block" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {toast ? (
                <div className="fixed top-6 right-6 z-[60] rounded-xl bg-[#0f172a] text-white px-4 py-3 text-sm font-medium shadow-lg">
                    {toast}
                </div>
            ) : null}

            {selectedRow ? (
                <DeceasedProfileDrawer
                    row={selectedRow}
                    partners={partners}
                    onClose={() => setSelectedRow(null)}
                    onRegistered={() => {
                        setSelectedRow(null);
                        router.refresh();
                    }}
                    onDeleted={(profileId) => {
                        setRows((prev) =>
                            prev.filter((r) => r.deceasedProfileId !== profileId)
                        );
                        setSelectedRow(null);
                        showToast('Profilo eliminato');
                    }}
                    onUpdated={(detail) => {
                        setRows((prev) =>
                            prev.map((r) =>
                                r.deceasedProfileId === detail.deceasedProfileId
                                    ? {
                                          ...r,
                                          fullName: detail.fullName,
                                          cemeteryCity: detail.cemeteryCity,
                                          cemeteryName: detail.cemeteryName,
                                          gravePosition: detail.gravePosition,
                                          photoUrl: detail.photoUrl,
                                          birthDate: detail.birthDate,
                                          deathDate: detail.deathDate,
                                      }
                                    : r
                            )
                        );
                        setSelectedRow((prev) =>
                            prev && prev.deceasedProfileId === detail.deceasedProfileId
                                ? {
                                      ...prev,
                                      fullName: detail.fullName,
                                      cemeteryCity: detail.cemeteryCity,
                                      cemeteryName: detail.cemeteryName,
                                      gravePosition: detail.gravePosition,
                                      photoUrl: detail.photoUrl,
                                      birthDate: detail.birthDate,
                                      deathDate: detail.deathDate,
                                  }
                                : prev
                        );
                    }}
                />
            ) : null}
        </div>
    );
}
