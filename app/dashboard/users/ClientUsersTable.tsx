'use client';

import { useState } from 'react';
import { Search, ChevronRight, User, Image as ImageIcon, MapPin, Calendar, Mail, UserPlus } from 'lucide-react';
import Image from 'next/image';
import CustodiedProofGallery from '@/components/dashboard/CustodiedProofGallery';
import AdminMediaUploadAvatar from '@/components/dashboard/AdminMediaUploadAvatar';
import CreateUserModal from '@/components/dashboard/CreateUserModal';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';

const formatITDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    
    // Auto-correzione per anomalie del database (es. anni salvati come 43 o 13 invece di 1943 o 2013)
    let correctedYear = year;
    if (year === 43) correctedYear = 1943;
    if (year === 13) correctedYear = 2013;
    
    // Se l'anno è espresso in sole due/tre cifre (es: 43 o 13), formattiamolo con zeri ma visivamente corretto
    const paddedYear = String(correctedYear).padStart(4, '0');
    return `${day}/${month}/${paddedYear}`;
};

export default function ClientUsersTable({
    initialUsers,
    florists = [],
}: {
    initialUsers: any[];
    florists?: { id: string; shopName: string; ownerName: string | null }[];
}) {
    const [users, setUsers] = useState(initialUsers);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<any | null>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [rowDraft, setRowDraft] = useState<Record<string, { name: string; phone: string; email: string }>>({});
    const [rowSavingId, setRowSavingId] = useState<string | null>(null);

    const filteredUsers = users.filter(u =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.phone?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const [isSavingUser, setIsSavingUser] = useState(false);
    const [savingOrderId, setSavingOrderId] = useState<string | null>(null);

    const beginRowEdit = (u: any) => {
        if (!u.id || String(u.id).startsWith('virtual_')) return;
        setEditingUserId(u.id);
        setRowDraft((prev) => ({
            ...prev,
            [u.id]: {
                name: u.name || '',
                phone: u.phone === 'Non specificato' ? '' : (u.phone || ''),
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

    const resolveOrderIdForUser = (u: { id: string; orders: { id: string }[] }) =>
        u.orders[0]?.id || (u.id.startsWith('virtual_') ? u.id.slice('virtual_'.length) : undefined);

    const handleAvatarUploaded = (url: string, meta?: { userId?: string }) => {
        if (!selectedUser) return;
        const nextId = meta?.userId || selectedUser.id;
        const updated = { ...selectedUser, profilePicUrl: url, id: nextId };
        setSelectedUser(updated);
        setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? updated : u)));
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingUser(true);
        const form = e.target as HTMLFormElement;
        const name = (form.elements.namedItem('userName') as HTMLInputElement).value;
        const email = (form.elements.namedItem('userEmail') as HTMLInputElement).value;
        const phone = (form.elements.namedItem('userPhone') as HTMLInputElement).value;
        const orderIds = selectedUser.orders.map((o: any) => o.id);

        try {
            const res = await fetch('/api/dashboard/users/sync-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phone, orderIds })
            });
            if (res.ok) {
                const updatedModUser = { ...selectedUser, name, email, phone };
                setSelectedUser(updatedModUser);
                setUsers(prev => prev.map(u => u.id === selectedUser.id ? updatedModUser : u));
                alert('Profilo Utente aggiornato nei database storici!');
            }
        } catch {
            alert('Errore di sincronizzazione');
        } finally {
            setIsSavingUser(false);
        }
    };

    const handleSaveOrderDates = async (e: React.FormEvent, order: any) => {
        e.preventDefault();
        setSavingOrderId(order.id);
        const form = e.target as HTMLFormElement;
        const deceasedBirthDateRaw = (form.elements.namedItem('deceasedBirthDate') as HTMLInputElement).value.trim();
        const deceasedDeathDateRaw = (form.elements.namedItem('deceasedDeathDate') as HTMLInputElement).value.trim();

        const parseITDateToISO = (raw: string) => {
            if (!raw) return null;
            // Se l'utente inserisce la data usando trattini o in formato ISO YYYY-MM-DD
            if (raw.includes('-')) {
                const parts = raw.split('-');
                if (parts.length === 3 && parts[0].length === 4) {
                    return raw; // Già in formato YYYY-MM-DD
                }
            }
            // Formato standard italiano: GG/MM/AAAA
            const parts = raw.split('/');
            if (parts.length === 3) {
                const day = parts[0].trim().padStart(2, '0');
                const month = parts[1].trim().padStart(2, '0');
                let year = parts[2].trim();
                
                // Se l'utente scrive l'anno a 2 cifre (es: 43 o 13), completiamo automaticamente a 1943 o 2013
                if (year.length === 2) {
                    const yearNum = parseInt(year, 10);
                    year = yearNum < 50 ? `20${year}` : `19${year}`;
                } else if (year.length === 3) {
                    year = year.padStart(4, '0');
                }
                return `${year}-${month}-${day}`;
            }
            return raw;
        };

        const deceasedBirthDate = parseITDateToISO(deceasedBirthDateRaw);
        const deceasedDeathDate = parseITDateToISO(deceasedDeathDateRaw);

        try {
            const res = await fetch(`/api/dashboard/orders/${order.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deceasedBirthDate, deceasedDeathDate })
            });
            if (res.ok) {
                const updated = await res.json();
                
                // Aggiorniamo sia il Modale che la Tabella
                const updatedOrders = selectedUser.orders.map((o: any) => o.id === order.id ? { ...o, deceasedBirthDate: updated.deceasedBirthDate, deceasedDeathDate: updated.deceasedDeathDate } : o);
                const updatedModUser = { ...selectedUser, orders: updatedOrders };
                
                setSelectedUser(updatedModUser);
                setUsers(prev => prev.map(u => u.id === selectedUser.id ? updatedModUser : u));
                alert('Date commemorative salvate nel server!');
            }
        } catch {
            alert('Errore aggiornamento ordine');
        } finally {
            setSavingOrderId(null);
        }
    };

    return (
        <div>
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div className="relative max-w-md flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Cerca utente per nome o telefono..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-fm-gold focus:ring-1 focus:ring-fm-gold outline-none transition-all"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => setCreateModalOpen(true)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm"
                >
                    <UserPlus size={16} /> Aggiungi utente
                </button>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-sm font-medium text-gray-500 uppercase tracking-wider">
                                <th className="px-6 py-4">Giardino Utente</th>
                                <th className="px-6 py-4">Telefono</th>
                                <th className="px-6 py-4">Città</th>
                                <th className="px-6 py-4">Ordini (Memorie)</th>
                                <th className="px-6 py-4">Spesa Totale</th>
                                <th className="px-6 py-4 text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">Nessun utente trovato.</td>
                                </tr>
                            ) : (
                                filteredUsers.map((u, i) => (
                                    <tr
                                        key={i}
                                        className="hover:bg-gray-50/50 transition-colors"
                                    >
                                        <td className="px-6 py-4">
                                            <button
                                                type="button"
                                                className="flex items-center gap-3 text-left w-full"
                                                onClick={() => setSelectedUser(u)}
                                            >
                                                {u.profilePicUrl ? (
                                                    <Image
                                                        src={u.profilePicUrl}
                                                        alt={u.name || 'Utente'}
                                                        width={40}
                                                        height={40}
                                                        className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-sm"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 bg-[#EFEAE2] rounded-full flex items-center justify-center text-fm-gold font-bold">
                                                        {u.name?.charAt(0) || '?'}
                                                    </div>
                                                )}
                                                {editingUserId === u.id ? (
                                                    <input
                                                        value={rowDraft[u.id]?.name || ''}
                                                        onChange={(e) =>
                                                            setRowDraft((prev) => ({
                                                                ...prev,
                                                                [u.id]: {
                                                                    ...(prev[u.id] || { name: '', phone: '', email: '' }),
                                                                    name: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="border border-gray-200 rounded px-2 py-1 text-sm"
                                                    />
                                                ) : (
                                                    <span className="font-semibold text-gray-900">{u.name}</span>
                                                )}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {editingUserId === u.id ? (
                                                <input
                                                    value={rowDraft[u.id]?.phone || ''}
                                                    onChange={(e) =>
                                                        setRowDraft((prev) => ({
                                                            ...prev,
                                                            [u.id]: {
                                                                ...(prev[u.id] || { name: '', phone: '', email: '' }),
                                                                phone: e.target.value,
                                                            },
                                                        }))
                                                    }
                                                    className="border border-gray-200 rounded px-2 py-1 text-sm w-full"
                                                />
                                            ) : (
                                                u.phone
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">{u.city}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
                                                {u.orders.length} ordini
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            € {(u.totalSpentCents / 100).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="inline-flex items-center gap-2">
                                                {editingUserId === u.id ? (
                                                    <>
                                                        <input
                                                            value={rowDraft[u.id]?.email || ''}
                                                            onChange={(e) =>
                                                                setRowDraft((prev) => ({
                                                                    ...prev,
                                                                    [u.id]: {
                                                                        ...(prev[u.id] || { name: '', phone: '', email: '' }),
                                                                        email: e.target.value,
                                                                    },
                                                                }))
                                                            }
                                                            placeholder="Email"
                                                            className="border border-gray-200 rounded px-2 py-1 text-xs w-44"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => saveRowEdit(u)}
                                                            disabled={rowSavingId === u.id}
                                                            className="px-2.5 py-1.5 text-xs font-semibold rounded bg-black text-white hover:bg-gray-800 disabled:opacity-50"
                                                        >
                                                            Salva
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={cancelRowEdit}
                                                            className="px-2.5 py-1.5 text-xs font-semibold rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                        >
                                                            Annulla
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => beginRowEdit(u)}
                                                            className="px-2.5 py-1.5 text-xs font-semibold rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                        >
                                                            Modifica
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteRowUser(u)}
                                                            className="px-2.5 py-1.5 text-xs font-semibold rounded border border-red-200 text-red-700 hover:bg-red-50"
                                                        >
                                                            Cancella
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedUser(u)}
                                                            className="px-2 py-1.5 text-xs font-semibold rounded text-gray-500 hover:text-gray-800"
                                                            title="Apri dettaglio"
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

            {/* User Detail Modal */}
            {selectedUser && (
                <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6" onClick={() => setSelectedUser(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        
                        {/* Modal Header */}
                        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-5">
                                <AdminMediaUploadAvatar
                                    imageUrl={selectedUser.profilePicUrl}
                                    fallbackLabel={selectedUser.name}
                                    entity="user"
                                    entityId={selectedUser.id.startsWith('virtual_') ? undefined : selectedUser.id}
                                    orderId={resolveOrderIdForUser(selectedUser)}
                                    onUploaded={handleAvatarUploaded}
                                />
                                <div>
                                    <h2 className="text-2xl font-display font-bold text-gray-900 leading-tight">Il Giardino di {selectedUser.name}</h2>
                                    <p className="text-sm text-gray-500 font-medium">Scatola della Memoria Infinita &bull; {selectedUser.orders.length} Consegnati</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedUser(null)} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto flex-1 font-body bg-white space-y-8">
                            
                            {/* User Edit Infos */}
                            <section className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                                    <User className="w-4 h-4" /> Dettagli Account (Modificabili)
                                </h3>
                                <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Nome Completo</label>
                                        <input type="text" name="userName" defaultValue={selectedUser.name} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:ring-2 focus:ring-fm-gold outline-none" required />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Telefono (WhatsApp)</label>
                                        <div className="flex gap-2">
                                            <input type="text" name="userPhone" defaultValue={selectedUser.phone} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:ring-2 focus:ring-fm-gold outline-none" required />
                                            {selectedUser.phone && selectedUser.phone !== 'Non specificato' && (
                                                <a href={`https://wa.me/${selectedUser.phone.replace(/[\s+]/g, '')}`} target="_blank" rel="noreferrer" className="bg-[#25D366] text-white px-3 py-2 rounded-lg hover:bg-[#1DA851] transition-colors shadow-sm whitespace-nowrap text-sm font-medium flex items-center">Contatta</a>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                                            <Mail className="w-3 h-3" /> Mail
                                        </label>
                                        <input type="email" name="userEmail" defaultValue={selectedUser.email || selectedUser.orders?.[0]?.buyerEmail || ''} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:ring-2 focus:ring-fm-gold outline-none" required />
                                    </div>
                                    <div className="flex items-end">
                                        <button type="submit" disabled={isSavingUser} className="w-full text-sm font-medium bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                                            {isSavingUser ? 'Salvataggio in corso...' : 'Salva Dettagli Utente'}
                                        </button>
                                    </div>
                                </form>
                            </section>

                            {/* Orders & Memories */}
                            <section>
                                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                                    <ImageIcon className="w-4 h-4" /> Archivio Ordini e Prove Visive
                                </h3>
                                
                                <div className="space-y-6">
                                    {[...selectedUser.orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((order: any) => (
                                        <div key={order.id} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gray-50/80 px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
                                                <div>
                                                    <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500 block mb-1">ORDINE #{order.orderNumber || order.id.slice(0,8)}</span>
                                                    <span className="font-semibold text-gray-900 text-base">{order.cemeteryName} - {order.cemeteryCity}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500 block mb-1">IN MEMORIA DI</span>
                                                    <span className="font-bold text-fm-gold text-lg flex flex-col items-end">
                                                        {order.deceasedName}
                                                        {(order.deceasedBirthDate || order.deceasedDeathDate) && (
                                                            <span className="text-xs font-semibold text-gray-500 mt-0.5">
                                                                {order.deceasedBirthDate ? new Date(order.deceasedBirthDate).getFullYear() : '?'} - {order.deceasedDeathDate ? new Date(order.deceasedDeathDate).getFullYear() : '?'}
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div className="p-5 flex flex-col lg:flex-row gap-8">
                                                <div className="flex-1 space-y-4">
                                                    <div className="flex items-start gap-2 text-sm text-gray-600 mb-2">
                                                        <Calendar className="w-4 h-4 mt-0.5 shrink-0 text-fm-gold" />
                                                        <span><strong>Data Consegna:</strong> {new Date(order.deliveryDate || order.funeralDate || order.createdAt).toLocaleDateString('it-IT')}</span>
                                                    </div>
                                                    <div className="flex items-start gap-2 text-sm text-gray-600 mb-6 border-b border-gray-100 pb-4">
                                                        <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-fm-gold" />
                                                        <span><strong>Posizione:</strong> {order.gravePosition || 'Non specificata in ordine'}</span>
                                                    </div>

                                                    {/* Form date Defunto */}
                                                    <form onSubmit={(e) => handleSaveOrderDates(e, order)} className="bg-white border text-sm border-gray-200 rounded-lg p-3">
                                                        <h4 className="font-semibold text-gray-700 mb-3 block">Modifica Date Anagrafiche Defunto</h4>
                                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                                            <div>
                                                                <label className="block text-xs text-gray-500 mb-1">Nascita</label>
                                                                <input 
                                                                    type="text" 
                                                                    name="deceasedBirthDate" 
                                                                    placeholder="GG/MM/AAAA"
                                                                    defaultValue={formatITDate(order.deceasedBirthDate)} 
                                                                    className="w-full border border-gray-200 rounded-md px-2 py-1 text-gray-700 focus:ring-1 focus:ring-fm-gold outline-none" 
                                                                    required 
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-500 mb-1">Decesso</label>
                                                                <input 
                                                                    type="text" 
                                                                    name="deceasedDeathDate" 
                                                                    placeholder="GG/MM/AAAA"
                                                                    defaultValue={formatITDate(order.deceasedDeathDate)} 
                                                                    className="w-full border border-gray-200 rounded-md px-2 py-1 text-gray-700 focus:ring-1 focus:ring-fm-gold outline-none" 
                                                                    required 
                                                                />
                                                            </div>
                                                        </div>
                                                        <button type="submit" disabled={savingOrderId === order.id} className="text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 rounded transition-colors w-full disabled:opacity-50">
                                                            {savingOrderId === order.id ? 'Salvataggio...' : 'Applica e Salva Date'}
                                                        </button>
                                                    </form>
                                                </div>
                                                
                                                <div className="lg:w-[420px] shrink-0 bg-gray-50 rounded-xl p-4 border border-gray-100 flex flex-col items-stretch">
                                                    <CustodiedProofGallery
                                                        orderId={order.id}
                                                        deceasedName={order.deceasedName}
                                                        initialBefore={getOrderProofPhotos(order).before}
                                                        initialAfter={getOrderProofPhotos(order).after}
                                                        lat={order.latitude ?? order.deliveryProof?.gpsLatitude}
                                                        lng={order.longitude ?? order.deliveryProof?.gpsLongitude}
                                                        isAdmin
                                                        showGpsMap
                                                        compact
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                        </div>
                    </div>
                </div>
            )}

            <CreateUserModal
                open={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                florists={florists}
                onCreated={() => {
                    alert('Utente creato. Apparira in elenco solo dopo il primo ordine con spesa > 0.');
                }}
            />
        </div>
    );
}
