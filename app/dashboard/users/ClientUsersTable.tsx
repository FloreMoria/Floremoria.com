'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
    Search,
    User,
    Image as ImageIcon,
    MapPin,
    Calendar,
    Mail,
    UserPlus,
    Filter,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    RotateCcw,
    Shield,
    CheckCircle2,
    Ban,
    ShoppingBag,
    Pencil,
    Trash2,
} from 'lucide-react';

import Image from 'next/image';
import CustodiedProofGallery from '@/components/dashboard/CustodiedProofGallery';
import AdminMediaUploadAvatar from '@/components/dashboard/AdminMediaUploadAvatar';
import CreateUserModal from '@/components/dashboard/CreateUserModal';
import ShareableLinkPanel from '@/components/dashboard/ShareableLinkPanel';
import UserTypeBadge from '@/components/dashboard/UserTypeBadge';
import { compareBySurname, formatPersonName, SURNAME_PARTICLES } from '@/lib/utils/formatPersonName';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';


const formatITDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    let year = d.getFullYear();

    if (year === 43) year = 1943;
    if (year === 13) year = 2013;

    const shortYear = String(year).slice(-2);
    return `${day}/${month}/${shortYear}`;
};

type UserRoleFilter = 'ALL' | 'ADMIN' | 'CUSTOMER' | 'FLORIST';
type UserStatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED';
type SortOption = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc' | 'orders_desc' | 'orders_asc';

export default function ClientUsersTable({
    initialUsers,
    florists = [],
}: {
    initialUsers: any[];
    florists?: { id: string; shopName: string; ownerName: string | null }[];
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const [users, setUsers] = useState(initialUsers);

    // Leggi i parametri iniziali dall'URL (default: alfabetico per cognome A-Z)
    const initialQuery = searchParams.get('q') || '';
    const initialSort = (searchParams.get('sort') as SortOption) || 'name_asc';
    
    const [searchInput, setSearchInput] = useState(initialQuery);
    const [searchTerm, setSearchTerm] = useState(initialQuery);
    const [sortOption, setSortOption] = useState<SortOption>(initialSort);

    const [selectedUser, setSelectedUser] = useState<any | null>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [rowDraft, setRowDraft] = useState<Record<string, { name: string; phone: string; email: string }>>({});
    const [rowSavingId, setRowSavingId] = useState<string | null>(null);
    const [isSavingUser, setIsSavingUser] = useState(false);
    const [savingOrderId, setSavingOrderId] = useState<string | null>(null);

    // Sincronizza lo stato locale se cambia l'URL (navigazione browser avanti/indietro)
    useEffect(() => {
        const q = searchParams.get('q') || '';
        setSearchInput(q);
        setSearchTerm(q);
        setSortOption((searchParams.get('sort') as SortOption) || 'name_asc');
    }, [searchParams]);

    // Aggiorna gli URL SearchParams in Next.js in modo trasparente
    const updateUrlParams = (updates: { q?: string; sort?: string }) => {
        const params = new URLSearchParams(searchParams.toString());

        const newQ = updates.q !== undefined ? updates.q : searchTerm;
        const newSort = updates.sort !== undefined ? updates.sort : sortOption;

        if (newQ.trim()) params.set('q', newQ.trim());
        else params.delete('q');

        params.delete('role');
        params.delete('status');

        if (newSort && newSort !== 'name_asc') params.set('sort', newSort);
        else params.delete('sort');

        const queryString = params.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    };

    const handleSearchSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const val = searchInput.trim();
        setSearchTerm(val);
        updateUrlParams({ q: val });
    };

    const handleSortChange = (val: SortOption) => {
        setSortOption(val);
        updateUrlParams({ sort: val });
    };

    const resetFilters = () => {
        setSearchInput('');
        setSearchTerm('');
        setSortOption('name_asc');
        router.replace(pathname, { scroll: false });
    };

    const toggleSortHeader = (type: 'name' | 'orders' | 'created') => {
        let nextSort: SortOption = 'name_asc';
        if (type === 'name') {
            nextSort = sortOption === 'name_asc' ? 'name_desc' : 'name_asc';
        } else if (type === 'orders') {
            nextSort = sortOption === 'orders_desc' ? 'orders_asc' : 'orders_desc';
        } else if (type === 'created') {
            nextSort = sortOption === 'created_desc' ? 'created_asc' : 'created_desc';
        }
        handleSortChange(nextSort);
    };

    // Logica di Filtraggio e Ordinamento Avanzato
    const filteredUsers = useMemo(() => {
        let list = [...users];

        // 1. Ricerca Globale (Nome, Email, Telefono, Città)
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase().trim();
            list = list.filter(
                (u) =>
                    (u.name && u.name.toLowerCase().includes(q)) ||
                    (u.email && u.email.toLowerCase().includes(q)) ||
                    (u.phone && u.phone.toLowerCase().includes(q)) ||
                    (u.city && u.city.toLowerCase().includes(q))
            );
        }

        // 2. Ordinamento Colonne (Default: per Cognome A-Z)
        list.sort((a, b) => {
            if (sortOption === 'name_desc') {
                return compareBySurname(b.name || '', a.name || '');
            }
            if (sortOption === 'orders_desc') {
                return (b.ordersCount || b.orders?.length || 0) - (a.ordersCount || a.orders?.length || 0);
            }
            if (sortOption === 'orders_asc') {
                return (a.ordersCount || a.orders?.length || 0) - (b.ordersCount || b.orders?.length || 0);
            }
            if (sortOption === 'created_desc') {
                const dateA = new Date(a.createdAt || a.lastOrderDate || 0).getTime();
                const dateB = new Date(b.createdAt || b.lastOrderDate || 0).getTime();
                return dateB - dateA;
            }
            if (sortOption === 'created_asc') {
                const dateA = new Date(a.createdAt || a.lastOrderDate || 0).getTime();
                const dateB = new Date(b.createdAt || b.lastOrderDate || 0).getTime();
                return dateA - dateB;
            }
            // Default: name_asc (ordinamento per cognome A-Z)
            return compareBySurname(a.name || '', b.name || '');
        });

        return list;
    }, [users, searchTerm, sortOption]);

    const isFiltered = Boolean(searchTerm || sortOption !== 'name_asc');

    const beginRowEdit = (u: any) => {
        if (!u.id || String(u.id).startsWith('virtual_')) return;
        setEditingUserId(u.id);
        setRowDraft((prev) => ({
            ...prev,
            [u.id]: {
                name: u.name || '',
                phone: u.phone || '',
                email: u.email || '',
            },
        }));
    };

    const cancelRowEdit = () => {
        setEditingUserId(null);
    };

    const saveRowEdit = async (u: any) => {
        const draft = rowDraft[u.id];
        if (!draft) return;
        setRowSavingId(u.id);
        try {
            const res = await fetch(`/api/dashboard/users/${u.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Salvataggio non riuscito.');
            }
            const updated = await res.json();
            setUsers((prev) => prev.map((item) => (item.id === u.id ? { ...item, ...updated } : item)));
            if (selectedUser?.id === u.id) {
                setSelectedUser((prev: any) => ({ ...prev, ...updated }));
            }
            setEditingUserId(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Errore salvataggio utente.');
        } finally {
            setRowSavingId(null);
        }
    };

    const deleteRowUser = async (u: any) => {
        const ok = window.confirm(`Confermi l'eliminazione dell'utente "${u.name || u.email || u.id}"?`);
        if (!ok) return;
        try {
            const res = await fetch(`/api/dashboard/users/${u.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Eliminazione non riuscita.');
            }
            setUsers((prev) => prev.filter((item) => item.id !== u.id));
            if (selectedUser?.id === u.id) {
                setSelectedUser(null);
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Errore eliminazione utente.');
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;
        setIsSavingUser(true);
        const form = e.target as HTMLFormElement;
        const name = (form.elements.namedItem('userName') as HTMLInputElement)?.value || '';
        const email = (form.elements.namedItem('userEmail') as HTMLInputElement)?.value || '';
        const phone = (form.elements.namedItem('userPhone') as HTMLInputElement)?.value || '';
        const orderIds = (selectedUser.orders || []).map((o: any) => o.id);

        try {
            const res = await fetch('/api/dashboard/users/sync-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phone, orderIds }),
            });
            if (res.ok) {
                const updatedModUser = { ...selectedUser, name, email, phone };
                setSelectedUser(updatedModUser);
                setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? updatedModUser : u)));
                router.refresh();
                alert('Profilo Utente aggiornato!');
            }
        } catch {
            alert('Errore di sincronizzazione profilo.');
        } finally {
            setIsSavingUser(false);
        }
    };


    const handleAvatarUploaded = (url: string, meta?: { userId?: string }) => {
        if (!selectedUser) return;
        const nextId = meta?.userId || selectedUser.id;
        const updated = { ...selectedUser, profilePicUrl: url, id: nextId };
        setSelectedUser(updated);
        setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? updated : u)));
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'ADMIN':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        <Shield size={11} /> Admin
                    </span>
                );
            case 'FLORIST':
            case 'PARTNER':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                        🌸 Fiorista
                    </span>
                );
            default:
                return null;
        }
    };

    const getStatusBadge = (status: string) => {
        if (status === 'SUSPENDED') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    <Ban size={11} /> Sospeso
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 size={11} /> Attivo
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Toolbar Ricerca, Filtri & Ordinamento */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                {/* Campo di Ricerca e Tasto Cerca (Invio o Click) */}
                <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Cerca utente per nome, email, telefono o città…"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-fm-gold focus:ring-2 focus:ring-fm-gold/20 transition-all"
                        />
                    </div>
                    <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-black text-white text-xs font-bold hover:bg-gray-800 transition-colors shadow-sm shrink-0"
                    >
                        <Search size={14} />
                        <span>Cerca</span>
                    </button>
                </form>

                {/* Blocco Inferiore: Tasto Nuovo Utente (sotto la ricerca) + Ordinamento & Reset */}
                <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => setCreateModalOpen(true)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black text-white text-xs font-bold hover:bg-gray-800 transition-colors shadow-sm shrink-0"
                    >
                        <UserPlus size={15} /> Nuovo Utente
                    </button>

                    <div className="flex items-center gap-3 ml-auto">
                        {/* Selettore Ordinamento */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider hidden sm:inline">
                                Ordina:
                            </span>
                            <select
                                value={sortOption}
                                onChange={(e) => handleSortChange(e.target.value as SortOption)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 bg-gray-50/50 text-gray-700 outline-none focus:border-fm-gold"
                            >
                                <option value="created_desc">Data di Registrazione (Più recente)</option>
                                <option value="created_asc">Data di Registrazione (Meno recente)</option>
                                <option value="name_asc">Nome Utente (A-Z)</option>
                                <option value="name_desc">Nome Utente (Z-A)</option>
                                <option value="orders_desc">Volumi Ordini (Decrescente)</option>
                                <option value="orders_asc">Volumi Ordini (Crescente)</option>
                            </select>
                        </div>

                        {/* Reset Filtri */}
                        {isFiltered && (
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                                title="Ripristina filtri e ricerca"
                            >
                                <RotateCcw size={13} /> Ripristina
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="dashboard-table-scroll w-full overflow-x-auto lg:overflow-x-visible">
                    <table className="w-full text-left border-collapse table-auto lg:table-fixed">
                        <thead>
                            <tr className="bg-gray-50/70 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                <th
                                    onClick={() => toggleSortHeader('name')}
                                    className="px-4 py-3.5 cursor-pointer hover:text-black transition-colors w-auto lg:w-[25%]"
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span>Giardino Utente</span>
                                        {sortOption === 'name_asc' ? (
                                            <ArrowUp size={13} className="text-fm-gold" />
                                        ) : sortOption === 'name_desc' ? (
                                            <ArrowDown size={13} className="text-fm-gold" />
                                        ) : (
                                            <ArrowUpDown size={13} className="opacity-40" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-4 py-3.5 w-auto lg:w-[18%]">Stato / Ruolo</th>
                                <th className="px-4 py-3.5 w-auto lg:w-[25%]">Contatti</th>
                                <th
                                    onClick={() => toggleSortHeader('orders')}
                                    className="px-3 py-3.5 cursor-pointer hover:text-black transition-colors text-center w-auto lg:w-[10%]"
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        <span>Ordini</span>
                                        {sortOption === 'orders_desc' ? (
                                            <ArrowDown size={13} className="text-fm-gold" />
                                        ) : sortOption === 'orders_asc' ? (
                                            <ArrowUp size={13} className="text-fm-gold" />
                                        ) : (
                                            <ArrowUpDown size={13} className="opacity-40" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-3 py-3.5 text-right w-auto lg:w-[10%]">Spesa</th>
                                <th
                                    onClick={() => toggleSortHeader('created')}
                                    className="px-3 py-3.5 cursor-pointer hover:text-black transition-colors text-right w-auto lg:w-[10%]"
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        <span>Data Reg.</span>
                                        {sortOption === 'created_desc' ? (
                                            <ArrowDown size={13} className="text-fm-gold" />
                                        ) : sortOption === 'created_asc' ? (
                                            <ArrowUp size={13} className="text-fm-gold" />
                                        ) : (
                                            <ArrowUpDown size={13} className="opacity-40" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-4 py-3.5 text-right w-auto lg:w-[12%]">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <User size={32} className="text-gray-300 stroke-[1.5]" />
                                            <span className="text-sm font-medium">Nessun utente corrisponde ai filtri selezionati.</span>
                                            {isFiltered && (
                                                <button
                                                    onClick={resetFilters}
                                                    className="mt-2 text-xs font-bold text-fm-gold hover:underline"
                                                >
                                                    Ripristina tutti i filtri
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((u, i) => {
                                    const rawName = formatPersonName(u.name || 'Utente Sconosciuto');
                                    const nameParts = rawName.split(/\s+/).filter(Boolean);
                                    let lastName = nameParts[nameParts.length - 1] || 'Utente';
                                    let firstName = nameParts.slice(0, -1).join(' ');
                                    if (nameParts.length >= 2 && SURNAME_PARTICLES.has(nameParts[nameParts.length - 2].toLowerCase())) {
                                        lastName = nameParts.slice(nameParts.length - 2).join(' ');
                                        firstName = nameParts.slice(0, nameParts.length - 2).join(' ');
                                    }
                                    const isSingleWord = nameParts.length <= 1;

                                    return (
                                        <tr
                                            key={u.id || i}
                                            className={`hover:bg-gray-50/50 transition-colors ${
                                                editingUserId !== u.id ? 'cursor-pointer' : ''
                                            }`}
                                            onClick={() => {
                                                if (editingUserId) return;
                                                setSelectedUser(u);
                                            }}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {u.profilePicUrl ? (
                                                        <Image
                                                            src={u.profilePicUrl}
                                                            alt={u.name || 'Utente'}
                                                            width={36}
                                                            height={36}
                                                            className="w-9 h-9 rounded-full object-cover border border-gray-200 shadow-sm shrink-0"
                                                            unoptimized
                                                        />
                                                    ) : (
                                                        <div className="w-9 h-9 bg-[#EFEAE2] rounded-full flex items-center justify-center text-fm-gold font-bold shrink-0 text-xs">
                                                            {u.name?.charAt(0) || '?'}
                                                        </div>
                                                    )}
                                                    {editingUserId === u.id ? (
                                                        <input
                                                            value={rowDraft[u.id]?.name || ''}
                                                            onChange={(e) =>
                                                                setRowDraft((prev) => ({
                                                                    ...prev,
                                                                    [u.id]: { ...prev[u.id], name: e.target.value },
                                                                }))
                                                            }
                                                            className="px-2 py-1 border border-gray-300 rounded text-xs font-semibold w-full"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    ) : (
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-900 text-sm leading-tight">
                                                                {lastName}
                                                            </span>
                                                            {!isSingleWord && firstName && (
                                                                <span className="text-xs font-normal text-gray-600 leading-tight">
                                                                    {firstName}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {getRoleBadge(u.role)}
                                                    <UserTypeBadge userId={u.id} initialType={u.userType} />
                                                    {getStatusBadge(u.status)}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {editingUserId === u.id ? (
                                                    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            value={rowDraft[u.id]?.email || ''}
                                                            onChange={(e) =>
                                                                setRowDraft((prev) => ({
                                                                    ...prev,
                                                                    [u.id]: { ...prev[u.id], email: e.target.value },
                                                                }))
                                                            }
                                                            className="px-2 py-1 border border-gray-300 rounded text-xs w-full"
                                                            placeholder="Email"
                                                        />
                                                        <input
                                                            value={rowDraft[u.id]?.phone || ''}
                                                            onChange={(e) =>
                                                                setRowDraft((prev) => ({
                                                                    ...prev,
                                                                    [u.id]: { ...prev[u.id], phone: e.target.value },
                                                                }))
                                                            }
                                                            className="px-2 py-1 border border-gray-300 rounded text-xs w-full"
                                                            placeholder="Telefono"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="space-y-0.5 text-xs text-gray-600">
                                                        {u.email && (
                                                            <div className="flex items-center gap-1.5 text-gray-700 font-medium">
                                                                <Mail size={12} className="text-gray-400 shrink-0" />
                                                                <span className="truncate max-w-[210px]">{u.email}</span>
                                                            </div>
                                                        )}
                                                        {u.phone && (
                                                            <div className="text-gray-500 font-mono text-[11px]">
                                                                {u.phone}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-slate-100 rounded-full font-mono text-xs font-bold text-slate-800">
                                                    <ShoppingBag size={11} className="text-slate-500" />
                                                    {u.ordersCount ?? u.orders?.length ?? 0}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono text-xs font-bold text-gray-900">
                                                €{((u.totalSpentCents || 0) / 100).toFixed(2)}
                                            </td>
                                            <td className="px-3 py-3 text-right text-xs text-gray-500 font-mono font-medium whitespace-nowrap">
                                                {formatITDate(u.createdAt || u.lastOrderDate)}
                                            </td>
                                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                {editingUserId === u.id ? (
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => void saveRowEdit(u)}
                                                            disabled={rowSavingId === u.id}
                                                            className="px-2 py-1 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700"
                                                        >
                                                            {rowSavingId === u.id ? '…' : 'Ok'}
                                                        </button>
                                                        <button
                                                            onClick={cancelRowEdit}
                                                            className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs font-bold hover:bg-gray-300"
                                                        >
                                                            X
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-end gap-1">
                                                        {!String(u.id).startsWith('virtual_') && (
                                                            <>
                                                                <button
                                                                    onClick={() => beginRowEdit(u)}
                                                                    title="Modifica Utente"
                                                                    aria-label="Modifica Utente"
                                                                    className="p-1.5 rounded-lg text-gray-600 hover:text-black hover:bg-gray-100 transition-colors"
                                                                >
                                                                    <Pencil size={15} />
                                                                </button>
                                                                <button
                                                                    onClick={() => void deleteRowUser(u)}
                                                                    title="Elimina Utente"
                                                                    aria-label="Elimina Utente"
                                                                    className="p-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors"
                                                                >
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal & User Detail Drawer */}
            {createModalOpen && (
                <CreateUserModal
                    open={createModalOpen}
                    onClose={() => setCreateModalOpen(false)}
                    onCreated={() => {
                        router.refresh();
                    }}
                    florists={florists}
                />
            )}

            {/* Drawer Dettaglio Utente e Storico Ordini */}
            {selectedUser && (
                <div
                    className="fixed inset-0 top-[72px] z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setSelectedUser(null)}
                >
                    <div
                        className="bg-white w-full max-w-2xl h-[calc(100vh-72px)] shadow-2xl overflow-y-auto p-6 md:p-8 space-y-8 animate-in slide-in-from-right duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >

                        {/* Header Drawer */}
                        <div className="flex items-start justify-between border-b border-gray-100 pb-6">
                            <div className="flex items-center gap-4">
                                <AdminMediaUploadAvatar
                                    entity="user"
                                    entityId={selectedUser.id}
                                    imageUrl={selectedUser.profilePicUrl}
                                    onUploaded={handleAvatarUploaded}
                                />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900">{formatPersonName(selectedUser.name)}</h2>
                                        <UserTypeBadge userId={selectedUser.id} initialType={selectedUser.userType} />
                                    </div>
                                    <p className="text-xs text-gray-500 font-medium mt-0.5 flex items-center gap-2">
                                        <span>ID: {selectedUser.id}</span>
                                        <span>·</span>
                                        {getRoleBadge(selectedUser.role)}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedUser(null)}
                                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modifica Rapida Profilo Utente */}
                        <form onSubmit={handleSaveProfile} className="bg-slate-50 p-4 rounded-2xl space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                Anagrafica Utente
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                    <label className="block font-semibold text-slate-600 mb-1">Nome Completo</label>
                                    <input
                                        name="userName"
                                        defaultValue={selectedUser.name}
                                        className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-fm-gold"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-600 mb-1">Email</label>
                                    <input
                                        name="userEmail"
                                        defaultValue={selectedUser.email}
                                        className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-fm-gold"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-600 mb-1">Telefono</label>
                                    <input
                                        name="userPhone"
                                        defaultValue={selectedUser.phone}
                                        className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-fm-gold"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end pt-1">
                                <button
                                    type="submit"
                                    disabled={isSavingUser}
                                    className="px-4 py-1.5 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-colors"
                                >
                                    {isSavingUser ? 'Aggiornamento…' : 'Salva Modifiche Anagrafiche'}
                                </button>
                            </div>
                        </form>

                        {/* Storico Ordini / Giardino della Memoria */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                <ShoppingBag size={16} className="text-fm-gold" />
                                <span>Storico Ordini & Prove Fotografiche ({selectedUser.orders?.length || 0})</span>
                            </h3>

                            {selectedUser.orders?.length === 0 ? (
                                <div className="p-6 bg-slate-50 rounded-2xl text-center text-xs text-slate-400 italic">
                                    Nessun ordine collegato a questo profilo utente.
                                </div>
                            ) : (
                                selectedUser.orders.map((ord: any) => {
                                    const proofPhotos = getOrderProofPhotos(ord);
                                    return (
                                        <div key={ord.id} className="p-4 border border-gray-100 rounded-2xl space-y-3 bg-white shadow-sm">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-mono font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-800">
                                                    #{ord.orderNumber || ord.id.slice(-6)}
                                                </span>
                                                <span className="font-semibold text-slate-600">
                                                    €{((ord.totalPriceCents || 0) / 100).toFixed(2)}
                                                </span>
                                            </div>

                                            <div className="text-xs text-slate-700 font-medium">
                                                🕊️ <span className="font-bold">{ord.deceasedName || 'Defunto'}</span>
                                                <div className="text-slate-400 text-[11px] mt-0.5">
                                                    {ord.cemeteryName} ({ord.cemeteryCity})
                                                </div>
                                            </div>

                                            {/* Foto di Garanzia Posa */}
                                            {(proofPhotos.before.length > 0 || proofPhotos.after.length > 0) && (
                                                <CustodiedProofGallery
                                                    orderId={ord.id}
                                                    deceasedName={ord.deceasedName || 'Defunto'}
                                                    initialBefore={proofPhotos.before}
                                                    initialAfter={proofPhotos.after}
                                                    showGpsMap={false}
                                                    isAdmin={true}
                                                />
                                            )}

                                            <ShareableLinkPanel
                                                label="Link Giardino della Memoria"
                                                url={`${typeof window !== 'undefined' ? window.location.origin : ''}/giardino/${ord.deceasedProfileId || ord.id}`}
                                            />
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
