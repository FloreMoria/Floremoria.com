'use client';

import { useState } from 'react';
import { Search, ChevronRight, User, Image as ImageIcon, MapPin, Phone, Calendar, Mail, Camera, Edit2 } from 'lucide-react';
import Image from 'next/image';

export default function ClientUsersTable({ initialUsers }: { initialUsers: any[] }) {
    const [users, setUsers] = useState(initialUsers);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<any | null>(null);

    const filteredUsers = users.filter(u =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.phone?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const [isSavingUser, setIsSavingUser] = useState(false);
    const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
    const [avatarKey, setAvatarKey] = useState(Date.now()); // mock trigger resync

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingUser(true);
        const form = e.target as HTMLFormElement;
        const name = (form.elements.namedItem('userName') as HTMLInputElement).value;
        const phone = (form.elements.namedItem('userPhone') as HTMLInputElement).value;
        const city = (form.elements.namedItem('userCity') as HTMLInputElement).value;
        const orderIds = selectedUser.orders.map((o: any) => o.id);

        try {
            const res = await fetch('/api/dashboard/users/sync-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, city, orderIds })
            });
            if (res.ok) {
                // Notifichiamo success logicamente e aggiorniamo la UI Modale + Tabella genitore
                const updatedModUser = { ...selectedUser, name, phone, city };
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
        const deceasedBirthDate = (form.elements.namedItem('deceasedBirthDate') as HTMLInputElement).value;
        const deceasedDeathDate = (form.elements.namedItem('deceasedDeathDate') as HTMLInputElement).value;

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

    const handleAvatarClick = () => {
        document.getElementById('avatar-upload')?.click();
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const localPreviewUrl = URL.createObjectURL(file);
            
            // Applichiamo la preview visiva all'utente selezionato in memoria 
            // (La persistenza richiederà il collegamento Server AWS S3)
            const updatedModUser = { ...selectedUser, profilePicUrl: localPreviewUrl };
            setSelectedUser(updatedModUser);
            setUsers(prev => prev.map(u => u.id === selectedUser.id ? updatedModUser : u));
            setAvatarKey(Date.now());
        }
    };

    return (
        <div>
            {/* Search Bar */}
            <div className="mb-6 max-w-md">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Cerca utente per nome o telefono..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-fm-gold focus:ring-1 focus:ring-fm-gold outline-none transition-all"
                    />
                </div>
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
                                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                                        onClick={() => setSelectedUser(u)}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {u.profilePicUrl ? (
                                                    <img src={u.profilePicUrl} alt={u.name} className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-sm" />
                                                ) : (
                                                    <div className="w-10 h-10 bg-[#EFEAE2] rounded-full flex items-center justify-center text-fm-gold font-bold">
                                                        {u.name?.charAt(0) || '?'}
                                                    </div>
                                                )}
                                                <span className="font-semibold text-gray-900">{u.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">{u.phone}</td>
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
                                            <ChevronRight className="w-5 h-5 text-gray-400 inline-block" />
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
                                <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
                                    <div className="w-20 h-20 bg-gray-200 rounded-full border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
                                        {selectedUser.profilePicUrl ? (
                                            <img src={selectedUser.profilePicUrl} alt="Profilo" className="w-full h-full object-cover" />
                                        ) : (
                                            <User key={avatarKey} className="w-10 h-10 text-gray-400" />
                                        )}
                                    </div>
                                    <div className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full shadow border border-gray-100 text-gray-600 hover:text-fm-gold hover:bg-gray-50 transition-colors">
                                        <Camera className="w-4 h-4" />
                                    </div>
                                    <input type="file" id="avatar-upload" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                                </div>
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
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Città di Residenza</label>
                                        <input type="text" name="userCity" defaultValue={selectedUser.city} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:ring-2 focus:ring-fm-gold outline-none" required />
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
                                                                <input type="date" name="deceasedBirthDate" defaultValue={order.deceasedBirthDate ? new Date(order.deceasedBirthDate).toISOString().split('T')[0] : '1900-01-01'} className="w-full border border-gray-200 rounded-md px-2 py-1 text-gray-700 focus:ring-1 focus:ring-fm-gold outline-none" required />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-500 mb-1">Decesso</label>
                                                                <input type="date" name="deceasedDeathDate" defaultValue={order.deceasedDeathDate ? new Date(order.deceasedDeathDate).toISOString().split('T')[0] : '1900-01-01'} className="w-full border border-gray-200 rounded-md px-2 py-1 text-gray-700 focus:ring-1 focus:ring-fm-gold outline-none" required />
                                                            </div>
                                                        </div>
                                                        <button type="submit" disabled={savingOrderId === order.id} className="text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 rounded transition-colors w-full disabled:opacity-50">
                                                            {savingOrderId === order.id ? 'Salvataggio...' : 'Applica e Salva Date'}
                                                        </button>
                                                    </form>
                                                </div>
                                                
                                                <div className="lg:w-[380px] shrink-0 bg-gray-50 rounded-xl p-4 border border-gray-100 flex flex-col items-center text-center">
                                                    <div className="flex items-center gap-2 mb-4 w-full justify-center">
                                                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest bg-white px-3 py-1 rounded-full shadow-sm border border-gray-100">Prove Visive Custodite</span>
                                                    </div>
                                                    {order.photos && order.photos.length > 0 ? (
                                                        <div className="flex gap-4 w-full overflow-x-auto pb-2 snap-x">
                                                            {order.photos.map((photo: string, idx: number) => (
                                                                <img key={idx} src={photo} alt="Memoria Visiva" className="w-32 h-32 object-cover rounded-xl border-2 border-white shadow-md shrink-0 snap-center transition-transform hover:scale-105 cursor-zoom-in" />
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-gray-400 flex flex-col items-center justify-center p-6 gap-2 bg-white rounded-xl w-full border border-dashed border-gray-200">
                                                            <ImageIcon className="w-8 h-8 opacity-20 mb-1" />
                                                            <span>Foto in attesa dal fiorista</span>
                                                        </div>
                                                    )}
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
        </div>
    );
}
