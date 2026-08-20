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
} from 'lucide-react';

import Image from 'next/image';
import CustodiedProofGallery from '@/components/dashboard/CustodiedProofGallery';
import AdminMediaUploadAvatar from '@/components/dashboard/AdminMediaUploadAvatar';
import CreateUserModal from '@/components/dashboard/CreateUserModal';
import ShareableLinkPanel from '@/components/dashboard/ShareableLinkPanel';
import UserTypeBadge from '@/components/dashboard/UserTypeBadge';
import { compareBySurname } from '@/lib/dashboard/sortDashboardLists';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';


const formatITDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    let year = d.getFullYear();

    if (year === 43) year = 1943;
    if (year === 13) year = 2013;

    const paddedYear = String(year).padStart(4, '0');
    return `${day}/${month}/${paddedYear}`;
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

    // Leggi i parametri iniziali dall'URL
    const initialQuery = searchParams.get('q') || '';
    const initialRole = (searchParams.get('role')?.toUpperCase() as UserRoleFilter) || 'ALL';
    const initialStatus = (searchParams.get('status')?.toUpperCase() as UserStatusFilter) || 'ALL';
    const initialSort = (searchParams.get('sort') as SortOption) || 'created_desc';

    const [searchTerm, setSearchTerm] = useState(initialQuery);
    const [roleFilter, setRoleFilter] = useState<UserRoleFilter>(initialRole);
    const [statusFilter, setStatusFilter] = useState<UserStatusFilter>(initialStatus);
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
        setSearchTerm(searchParams.get('q') || '');
        setRoleFilter((searchParams.get('role')?.toUpperCase() as UserRoleFilter) || 'ALL');
        setStatusFilter((searchParams.get('status')?.toUpperCase() as UserStatusFilter) || 'ALL');
        setSortOption((searchParams.get('sort') as SortOption) || 'created_desc');
    }, [searchParams]);

    // Aggiorna gli URL SearchParams in Next.js in modo trasparente
    const updateUrlParams = (updates: { q?: string; role?: string; status?: string; sort?: string }) => {
        const params = new URLSearchParams(searchParams.toString());

        const newQ = updates.q !== undefined ? updates.q : searchTerm;
        const newRole = updates.role !== undefined ? updates.role : roleFilter;
        const newStatus = updates.status !== undefined ? updates.status : statusFilter;
        const newSort = updates.sort !== undefined ? updates.sort : sortOption;

        if (newQ.trim()) params.set('q', newQ.trim());
        else params.delete('q');

        if (newRole && newRole !== 'ALL') params.set('role', newRole);
        else params.delete('role');

        if (newStatus && newStatus !== 'ALL') params.set('status', newStatus);
        else params.delete('status');

        if (newSort && newSort !== 'created_desc') params.set('sort', newSort);
        else params.delete('sort');

        const queryString = params.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    };

    const handleSearchChange = (val: string) => {
        setSearchTerm(val);
        updateUrlParams({ q: val });
    };

    const handleRoleChange = (val: UserRoleFilter) => {
        setRoleFilter(val);
        updateUrlParams({ role: val });
    };

    const handleStatusChange = (val: UserStatusFilter) => {
        setStatusFilter(val);
        updateUrlParams({ status: val });
    };

    const handleSortChange = (val: SortOption) => {
        setSortOption(val);
        updateUrlParams({ sort: val });
    };

    const resetFilters = () => {
        setSearchTerm('');
        setRoleFilter('ALL');
        setStatusFilter('ALL');
        setSortOption('created_desc');
        router.replace(pathname, { scroll: false });
    };

    const toggleSortHeader = (type: 'name' | 'orders' | 'created') => {
        let nextSort: SortOption = 'created_desc';
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

        // 2. Filtro Ruolo
        if (roleFilter !== 'ALL') {
            list = list.filter((u) => {
                if (roleFilter === 'ADMIN') return u.role === 'ADMIN';
                if (roleFilter === 'CUSTOMER') return u.role === 'CUSTOMER';
                if (roleFilter === 'FLORIST') return u.role === 'FLORIST' || u.role === 'PARTNER';
                return true;
            });
        }

        // 3. Filtro Stato Operativo
        if (statusFilter !== 'ALL') {
            list = list.filter((u) => {
                if (statusFilter === 'ACTIVE') return u.status === 'ACTIVE' || !u.status;
                if (statusFilter === 'SUSPENDED') return u.status === 'SUSPENDED';
                return true;
            });
        }

        // 4. Ordinamento Colonne
        list.sort((a, b) => {
            if (sortOption === 'name_asc') {
                return compareBySurname(a.name || '', b.name || '');
            }
            if (sortOption === 'name_desc') {
                return compareBySurname(b.name || '', a.name || '');
            }
            if (sortOption === 'orders_desc') {
                return (b.ordersCount || b.orders?.length || 0) - (a.ordersCount || a.orders?.length || 0);
            }
            if (sortOption === 'orders_asc') {
                return (a.ordersCount || a.orders?.length || 0) - (b.ordersCount || b.orders?.length || 0);
            }
            if (sortOption === 'created_asc') {
                const dateA = new Date(a.createdAt || a.lastOrderDate || 0).getTime();
                const dateB = new Date(b.createdAt || b.lastOrderDate || 0).getTime();
                return dateA - dateB;
            }
            // Default: created_desc
            const dateA = new Date(a.createdAt || a.lastOrderDate || 0).getTime();
            const dateB = new Date(b.createdAt || b.lastOrderDate || 0).getTime();
            return dateB - dateA;
        });

        return list;
    }, [users, searchTerm, roleFilter, statusFilter, sortOption]);

    const isFiltered = searchTerm || roleFilter !== 'ALL' || statusFilter !== 'ALL' || sortOption !== 'created_desc';

    const beginRowEdit = (u: any) => {
        if (!u.id || String(u.id).startsWith('virtual_')) return;
        setEditingUserId(u.id);
        setRowDraft((prev) => ({
            ...prev,
            [u.id]: {
                name: u.name || '',
                phone: u.phone === 'Non specificato' ? '' : u.phone || '',
                email: u.email || '',
            },
        }));
    };

    const cancelRowEdit = () => {
        setEditingUserId(null);
    };

    const saveRowEdit = async (u: any) => {
        if (!u.id || String(u.id).startsWith('virtual_')) return;
        const draft = rowDraft[u.id];
        if (!draft) return;

        setRowSavingId(u.id);
        try {
            const res = await fetch(`/api/dashboard/users/${u.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: draft.name,
                    phone: draft.phone || null,
                    email: draft.email || null,
                }),
            });
            const payload = await res.json();
            if (!res.ok || !payload?.ok) {
                throw new Error(payload?.error || 'Salvataggio non riuscito.');
            }

            setUsers((prev) =>
                prev.map((item) =>
                    item.id === u.id
                        ? { ...item, name: draft.name, phone: draft.phone || 'Non specificato', email: draft.email }
                        : item
                )
            );

            if (selectedUser?.id === u.id) {
                setSelectedUser((prev: any) => ({
                    ...prev,
                    name: draft.name,
                    phone: draft.phone || 'Non specificato',
                    email: draft.email,
                }));
            }

            setEditingUserId(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Errore salvataggio utente.');
        } finally {
            setRowSavingId(null);
        }
    };

    const deleteRowUser = async (u: any) => {
        if (!u.id || String(u.id).startsWith('virtual_')) return;
        const ok = window.confirm(
            'Confermi la cancellazione utente? Nota: utenti con ordini associati non possono essere cancellati.'
        );
        if (!ok) return;

        try {
            const res = await fetch(`/api/dashboard/users/${u.id}`, { method: 'DELETE' });
            const payload = await res.json();
            if (!res.ok || !payload?.ok) {
                throw new Error(payload?.error || 'Cancellazione non riuscita.');
            }
            setUsers((prev) => prev.filter((item) => item.id !== u.id));
            if (selectedUser?.id === u.id) setSelectedUser(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Errore cancellazione utente.');
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
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        <Shield size={12} /> Admin
                    </span>
                );
            case 'FLORIST':
            case 'PARTNER':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                        🌸 Fiorista
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        <User size={12} /> Cliente
                    </span>
                );
        }
    };

    const getStatusBadge = (status: string) => {
        if (status === 'SUSPENDED') {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    <Ban size={12} /> Sospeso
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 size={12} /> Attivo
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Toolbar Ricerca, Filtri & Ordinamento */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Input di Ricerca Globale */}
                    <div className="relative flex-1 min-w-[280px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Cerca utente per nome, email, telefono o città…"
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-fm-gold focus:ring-2 focus:ring-fm-gold/20 transition-all"
                        />
                    </div>

                    {/* Azioni Aggiuntive */}
                    <button
                        type="button"
                        onClick={() => setCreateModalOpen(true)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black text-white text-xs font-bold hover:bg-gray-800 transition-colors shadow-sm shrink-0"
                    >
                        <UserPlus size={15} /> Nuovo Utente
                    </button>
                </div>

                {/* Filtri Avanzati & Ordinamento */}
                <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <Filter size={14} className="text-fm-gold" /> Filtri:
                        </div>

                        {/* Filtro Ruolo */}
                        <select
                            value={roleFilter}
                            onChange={(e) => handleRoleChange(e.target.value as UserRoleFilter)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 bg-gray-50/50 text-gray-700 outline-none focus:border-fm-gold"
                        >
                            <option value="ALL">Tutti i Ruoli</option>
                            <option value="ADMIN">Amministratore</option>
                            <option value="CUSTOMER">Cliente</option>
                            <option value="FLORIST">Fiorista / Partner</option>
                        </select>

                        {/* Filtro Stato */}
                        <select
                            value={statusFilter}
                            onChange={(e) => handleStatusChange(e.target.value as UserStatusFilter)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 bg-gray-50/50 text-gray-700 outline-none focus:border-fm-gold"
                        >
                            <option value="ALL">Tutti gli Stati</option>
                            <option value="ACTIVE">Stato: Attivo</option>
                            <option value="SUSPENDED">Stato: Sospeso / Banned</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-3">
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
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/70 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                <th
                                    onClick={() => toggleSortHeader('name')}
                                    className="px-6 py-4 cursor-pointer hover:text-black transition-colors"
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
                                <th className="px-6 py-4">Ruolo & Stato</th>
                                <th className="px-6 py-4">Contatti</th>
                                <th className="px-6 py-4">Città</th>
                                <th
                                    onClick={() => toggleSortHeader('orders')}
                                    className="px-6 py-4 cursor-pointer hover:text-black transition-colors text-center"
                                >
                                    <div className="flex items-center justify-center gap-1.5">
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
                                <th className="px-6 py-4 text-right">Spesa Totale</th>
                                <th
                                    onClick={() => toggleSortHeader('created')}
                                    className="px-6 py-4 cursor-pointer hover:text-black transition-colors text-right"
                                >
                                    <div className="flex items-center justify-end gap-1.5">
                                        <span>Registrazione</span>
                                        {sortOption === 'created_desc' ? (
                                            <ArrowDown size={13} className="text-fm-gold" />
                                        ) : sortOption === 'created_asc' ? (
                                            <ArrowUp size={13} className="text-fm-gold" />
                                        ) : (
                                            <ArrowUpDown size={13} className="opacity-40" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
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
                                filteredUsers.map((u, i) => (
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
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {u.profilePicUrl ? (
                                                    <Image
                                                        src={u.profilePicUrl}
                                                        alt={u.name || 'Utente'}
                                                        width={40}
                                                        height={40}
                                                        className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-sm shrink-0"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 bg-[#EFEAE2] rounded-full flex items-center justify-center text-fm-gold font-bold shrink-0">
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
                                                    <div>
                                                        <div className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                                                            <span>{u.name || 'Utente Sconosciuto'}</span>
                                                            <UserTypeBadge userId={u.id} initialType={u.userType} />
                                                        </div>
                                                        <div className="text-[11px] text-gray-400 font-mono">
                                                            ID: {u.id?.slice(-8) || 'virtual'}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1 items-start">
                                                {getRoleBadge(u.role)}
                                                {getStatusBadge(u.status)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
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
                                                            <span className="truncate max-w-[180px]">{u.email}</span>
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
                                        <td className="px-6 py-4 text-xs font-medium text-gray-600">
                                            {u.city || '—'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="inline-flex items-center justify-center gap-1 px-3 py-1 bg-slate-100 rounded-full font-mono text-xs font-bold text-slate-800">
                                                <ShoppingBag size={12} className="text-slate-500" />
                                                {u.ordersCount ?? u.orders?.length ?? 0}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-sm font-bold text-gray-900">
                                            €{((u.totalSpentCents || 0) / 100).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-right text-xs text-gray-500 font-medium">
                                            {formatITDate(u.createdAt || u.lastOrderDate)}
                                        </td>
                                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                            {editingUserId === u.id ? (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => void saveRowEdit(u)}
                                                        disabled={rowSavingId === u.id}
                                                        className="px-2.5 py-1 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700"
                                                    >
                                                        {rowSavingId === u.id ? 'Salva…' : 'Salva'}
                                                    </button>
                                                    <button
                                                        onClick={cancelRowEdit}
                                                        className="px-2.5 py-1 bg-gray-200 text-gray-700 rounded text-xs font-bold hover:bg-gray-300"
                                                    >
                                                        Annulla
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-3 text-xs">
                                                    {!String(u.id).startsWith('virtual_') && (
                                                        <>
                                                            <button
                                                                onClick={() => beginRowEdit(u)}
                                                                className="text-gray-600 hover:text-black font-semibold"
                                                            >
                                                                Modifica
                                                            </button>
                                                            <button
                                                                onClick={() => void deleteRowUser(u)}
                                                                className="text-rose-600 hover:text-rose-800 font-semibold"
                                                            >
                                                                Elimina
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
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
                    className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setSelectedUser(null)}
                >
                    <div
                        className="bg-white w-full max-w-2xl h-full shadow-2xl overflow-y-auto p-6 md:p-8 space-y-8 animate-in slide-in-from-right duration-300"
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
                                        <h2 className="text-xl font-bold text-gray-900">{selectedUser.name}</h2>
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
