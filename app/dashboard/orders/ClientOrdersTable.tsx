'use client';

import React, { useState } from 'react';
import { Download, Filter, Image as ImageIcon, X, MessageSquare, Phone, MapPin, Package, Camera, Check, Info, Clock, Navigation, Users, Repeat, Activity, Plus, Copy } from 'lucide-react';
import Image from 'next/image';
import { exportToCSV } from '@/lib/utils';
import CreateOrderModal from '@/components/dashboard/CreateOrderModal';
import VeraAlertsBanner from '@/components/dashboard/VeraAlertsBanner';
import OrderDetailProofUpload from '@/components/dashboard/OrderDetailProofUpload';
import ShareableLinkPanel from '@/components/dashboard/ShareableLinkPanel';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';
import { getOrderProductSummary } from '@/lib/orders/formatDeliveredProducts';
import { isOrderCancelled } from '@/lib/dashboardOrdersFilter';
import { compareByRecentActivity } from '@/lib/dashboard/sortDashboardLists';

interface ClientOrdersTableProps {
    orders: any[];
    florists: any[];
    products: any[];
    users: any[];
    deceasedProfiles: any[];
    canChangeStatus: boolean;
    isGlobalAdmin?: boolean;
}

export default function ClientOrdersTable({ orders, florists, products, users, deceasedProfiles, canChangeStatus, isGlobalAdmin }: ClientOrdersTableProps) {
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [filterMenuOpen, setFilterMenuOpen] = useState(false);
    const [currentFilter, setCurrentFilter] = useState('TUTTI');

    // Filri & Sort State
    const [sortField, setSortField] = useState<'date' | 'alpha' | 'price'>('date');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterDate, setFilterDate] = useState('tutti');

    const [localOrders, setLocalOrders] = useState<any[]>(orders);
    React.useEffect(() => { setLocalOrders(orders); }, [orders]);

    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [duplicateSource, setDuplicateSource] = useState<any | null>(null);
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    const [rowOrderSavingId, setRowOrderSavingId] = useState<string | null>(null);
    const [alertsRefreshKey, setAlertsRefreshKey] = useState(0);
    const bumpVeraAlerts = () => setAlertsRefreshKey((k) => k + 1);
    const [rowOrderDraft, setRowOrderDraft] = useState<
        Record<string, { buyerFullName: string; customerPhone: string; deceasedName: string; cemeteryName: string; cemeteryCity: string; totalPriceCents: number; status: string }>
    >({});

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3200);
    };

    const statusMap = {
        'ACCEPTED': { label: 'Ricevuto', color: 'bg-yellow-100 text-yellow-800' },
        'IN_PROGRESS': { label: 'In Lavorazione', color: 'bg-blue-100 text-blue-800' },
        'PENDING': { label: 'In Attesa', color: 'bg-orange-100 text-orange-800' },
        'DELIVERING': { label: 'In Consegna', color: 'bg-purple-100 text-purple-800' },
        'COMPLETED': { label: 'Completato', color: 'bg-green-100 text-green-800' },
        'CANCELLED': { label: 'Annullato', color: 'bg-red-100 text-red-800' }
    };

    const statusTabOrder = ['ACCEPTED', 'IN_PROGRESS', 'PENDING', 'DELIVERING', 'COMPLETED', 'CANCELLED'];

    const formatDeliveryDate = (order: { deliveryDate?: string | Date | null; funeralDate?: string | Date | null }) => {
        const raw = order.deliveryDate || order.funeralDate;
        if (!raw) return '—';
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '—';
        const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
        return d.toLocaleDateString(
            'it-IT',
            hasTime
                ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
                : { day: '2-digit', month: '2-digit', year: 'numeric' }
        );
    };

    const handleSelectOrder = (order: any) => {
        setSelectedOrder(order);
    };

    const openOrderById = (orderId: string) => {
        const order = localOrders.find((o) => o.id === orderId);
        if (order) handleSelectOrder(order);
    };

    const openCreateModal = () => {
        setDuplicateSource(null);
        setCreateModalOpen(true);
    };

    const openDuplicateModal = (order: any) => {
        setDuplicateSource(order);
        setCreateModalOpen(true);
    };

    const closeCreateModal = () => {
        setCreateModalOpen(false);
        setDuplicateSource(null);
    };

    const closeDrawer = () => {
        setSelectedOrder(null);
    };

    const beginRowOrderEdit = (order: any) => {
        setEditingOrderId(order.id);
        setRowOrderDraft((prev) => ({
            ...prev,
            [order.id]: {
                buyerFullName: order.buyerFullName || '',
                customerPhone: order.customerPhone || '',
                deceasedName: order.deceasedName || '',
                cemeteryName: order.cemeteryName || '',
                cemeteryCity: order.cemeteryCity || '',
                totalPriceCents: Number(order.totalPriceCents || 0),
                status: order.status || 'PENDING',
            },
        }));
    };

    const cancelRowOrderEdit = () => {
        setEditingOrderId(null);
    };

    const saveRowOrderEdit = async (order: any) => {
        const draft = rowOrderDraft[order.id];
        if (!draft) return;
        setRowOrderSavingId(order.id);
        try {
            const res = await fetch(`/api/dashboard/orders/${order.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    buyerFullName: draft.buyerFullName,
                    customerPhone: draft.customerPhone,
                    deceasedName: draft.deceasedName,
                    cemeteryName: draft.cemeteryName,
                    cemeteryCity: draft.cemeteryCity,
                    totalPriceCents: draft.totalPriceCents,
                    status: draft.status,
                }),
            });
            if (!res.ok) {
                throw new Error('Salvataggio ordine non riuscito.');
            }
            const updated = await res.json();
            const patch = draft.status === 'CANCELLED'
                ? { ...draft, status: 'CANCELLED', deletedAt: updated.deletedAt ?? new Date().toISOString() }
                : draft;
            setLocalOrders((prev: any[]) =>
                prev.map((o) => (o.id === order.id ? { ...o, ...patch } : o))
            );
            if (selectedOrder?.id === order.id) {
                setSelectedOrder((prev: any) => ({ ...prev, ...patch }));
            }
            setEditingOrderId(null);
            showToast('Ordine aggiornato');
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Errore salvataggio ordine.');
        } finally {
            setRowOrderSavingId(null);
        }
    };

    const deleteRowOrder = async (order: any) => {
        const ok = window.confirm(`Confermi cancellazione ordine ${order.orderNumber || order.id}?`);
        if (!ok) return;
        try {
            const res = await fetch(`/api/dashboard/orders/${order.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || 'Cancellazione non riuscita.');
            }
            const cancelledAt = data.order?.deletedAt ?? new Date().toISOString();
            setLocalOrders((prev: any[]) =>
                prev.map((o) =>
                    o.id === order.id ? { ...o, status: 'CANCELLED', deletedAt: cancelledAt } : o
                )
            );
            if (selectedOrder?.id === order.id) {
                setSelectedOrder((prev: any) =>
                    prev ? { ...prev, status: 'CANCELLED', deletedAt: cancelledAt } : prev
                );
            }
            showToast('Ordine cancellato');
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Errore cancellazione ordine.');
        }
    };

    const StatusBadge = ({ status }: { status: string }) => {
        const conf = statusMap[status as keyof typeof statusMap] || { label: status, color: 'bg-gray-100 text-gray-800' };
        return (
            <span className={`px-2.5 py-1 rounded-full text-[12px] font-semibold tracking-wide ${conf.color}`}>
                {conf.label}
            </span>
        );
    };

    let filteredOrders = localOrders.filter(o => currentFilter === 'TUTTI' || o.status === currentFilter);

    // Filter Logic
    if (filterDate !== 'tutti') {
        const past = new Date();
        if (filterDate === 'mese') past.setMonth(past.getMonth() - 1);
        if (filterDate === 'trimestre') past.setMonth(past.getMonth() - 3);
        filteredOrders = filteredOrders.filter(o => new Date(o.createdAt) >= past);
    }

    if (filterSearch.trim() !== '') {
        const q = filterSearch.toLowerCase();
        filteredOrders = filteredOrders.filter(o =>
            (o.buyerFullName || '').toLowerCase().includes(q) ||
            (o.cemeteryCity || '').toLowerCase().includes(q) ||
            (o.items?.[0]?.product?.name || '').toLowerCase().includes(q) ||
            (statusMap[o.status as keyof typeof statusMap]?.label || '').toLowerCase().includes(q) ||
            ((o.totalPriceCents / 100).toFixed(2)).includes(q)
        );
    }

    // Sort Logic
    filteredOrders = filteredOrders.sort((a, b) => {
        let cmp = 0;
        if (sortField === 'date') {
            cmp = compareByRecentActivity(a, b);
            if (sortDirection === 'asc') cmp = -cmp;
            return cmp;
        }
        if (sortField === 'price') cmp = a.totalPriceCents - b.totalPriceCents;
        else if (sortField === 'alpha') cmp = (a.buyerFullName || '').localeCompare(b.buyerFullName || '');
        return sortDirection === 'asc' ? cmp : -cmp;
    });

    const handleExportCSV = () => {
        const exportData = filteredOrders.map(o => ({
            'Data': new Date(o.createdAt).toLocaleDateString('it-IT'),
            'Data Consegna': formatDeliveryDate(o),
            'ID Ordine': o.orderNumber || o.id.substring(o.id.length - 6).toUpperCase(),
            'Utente': o.buyerFullName || 'Sconosciuto',
            'Telefono': o.customerPhone || '',
            'Origine Citta': o.buyerCity || '',
            'Origine Nazione': o.buyerCountry || '',
            'Prodotto': o.items?.[0]?.product?.name || 'Composizione',
            'Prezzo': `${(o.totalPriceCents / 100).toFixed(2)} €`,
            'Comune Destinazione': o.cemeteryCity || '',
            'Cimitero': o.cemeteryName || '',
            'Ricorrente': o.isRecurring ? 'Si' : 'No',
            'Fiorista': o.partner?.shopName || o.partner?.ownerName || 'Nessuno',
            'Stato': (statusMap as any)[o.status]?.label || o.status
        }));
        exportToCSV(exportData, 'FloreMoria_Ordini.csv');
    };

    // Salvataggio effettivo nel DB del cambio status
    const updateStatus = async (orderId: string, newStatus: string) => {
        if (!canChangeStatus) return alert("Non hai i permessi per questa azione.");

        // Optimistic Update UI
        setLocalOrders((prev: any[]) => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        setSelectedOrder((prev: any) => prev?.id === orderId ? { ...prev, status: newStatus } : prev);

        try {
            const res = await fetch(`/api/dashboard/orders/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                showToast('Stato ordine aggiornato!');
            } else {
                alert('Errore aggiornamento stato nel database.');
            }
        } catch {
            alert('Errore di connessione durante l\'aggiornamento dello stato.');
        }
    };

    // Salvataggio fiorista assegnato e note posizione
    const handleSaveOrder = async () => {
        if (!selectedOrder) return;
        setIsSaving(true);

        try {
            const res = await fetch(`/api/dashboard/orders/${selectedOrder.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    partnerId: selectedOrder.partnerId || null,
                    specialNotes: selectedOrder.specialNotes || '',
                    gravePosition: selectedOrder.gravePosition || '',
                })
            });

            if (res.ok) {
                const updated = await res.json();
                
                // Aggiorna lo stato locale degli ordini
                setLocalOrders((prev: any[]) => prev.map(o => o.id === selectedOrder.id ? {
                    ...o,
                    partnerId: selectedOrder.partnerId,
                    specialNotes: selectedOrder.specialNotes,
                    gravePosition: selectedOrder.gravePosition,
                    partner: florists.find(f => f.id === selectedOrder.partnerId) || null
                } : o));

                showToast('Dettagli ordine salvati con successo!');
                bumpVeraAlerts();
                closeDrawer();
            } else {
                alert('Errore nel salvataggio dell\'assegnazione.');
            }
        } catch {
            alert('Errore di rete durante il salvataggio.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="relative">
            <VeraAlertsBanner
                refreshKey={alertsRefreshKey}
                onOpenOrder={openOrderById}
                onGravePositionSaved={(orderId, gravePosition) => {
                    setLocalOrders((prev) =>
                        prev.map((o) => (o.id === orderId ? { ...o, gravePosition } : o))
                    );
                    if (selectedOrder?.id === orderId) {
                        setSelectedOrder((prev: any) =>
                            prev ? { ...prev, gravePosition } : prev
                        );
                    }
                }}
            />
            {/* Header Section Integrata */}
            <header className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4 border-b border-gray-100 pb-6">
                <div>
                    <h1 className="text-[28px] font-semibold text-black tracking-tight">Coda Ordini & Consegne</h1>
                    <p className="text-gray-500 text-[15px] mt-1">
                        {isGlobalAdmin
                            ? "Gestisci l'hub centrale o smista le commesse ai fioristi locali."
                            : "Gestisci gli ordini a te assegnati e carica le foto della posa d'opera e del laboratorio."}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {isGlobalAdmin && (
                        <button
                            type="button"
                            onClick={openCreateModal}
                            className="flex items-center gap-2 px-4 py-2 border border-black rounded-full text-sm font-semibold text-white bg-black hover:bg-gray-800 transition-colors shadow-sm"
                            title="Aggiungi ordine"
                        >
                            <Plus size={16} /> Aggiungi ordine
                        </button>
                    )}
                    <button onClick={() => setFilterMenuOpen(!filterMenuOpen)} className={`flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full text-sm font-semibold transition-colors shadow-sm ${filterMenuOpen ? 'bg-gray-100 text-black shadow-inner' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                        <Filter size={15} className={`${filterMenuOpen ? 'text-black' : 'text-gray-500'}`} /> Filtri avanzati
                    </button>
                    <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-sm">
                        <Download size={15} className="text-gray-500" /> Scarica CSV
                    </button>
                </div>
            </header>

            {/* Pannello Filtri Expandibile */}
            {filterMenuOpen && (
                <div className="bg-gray-50 border border-gray-200 rounded-3xl p-6 mb-6 animate-in fade-in slide-in-from-top-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ricerca Generica</label>
                            <input type="text" placeholder="Es. Nome, Città, Prezzo..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} className="w-full border-gray-200 rounded-xl text-sm p-2 outline-none focus:ring-2 focus:ring-black" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Data</label>
                            <select value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-full border-gray-200 rounded-xl text-sm p-2 outline-none focus:ring-2 focus:ring-black">
                                <option value="tutti">Tutto il tempo</option>
                                <option value="mese">Ultimo Mese</option>
                                <option value="trimestre">Ultimo Trimestre</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ordina Per</label>
                            <select value={sortField} onChange={e => setSortField(e.target.value as any)} className="w-full border-gray-200 rounded-xl text-sm p-2 outline-none focus:ring-2 focus:ring-black">
                                <option value="date">Data Creazione</option>
                                <option value="alpha">Ordine Alfabetico</option>
                                <option value="price">Valore (Prezzo)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Direzione</label>
                            <select value={sortDirection} onChange={e => setSortDirection(e.target.value as any)} className="w-full border-gray-200 rounded-xl text-sm p-2 outline-none focus:ring-2 focus:ring-black">
                                <option value="desc">Decrescente (Z-A / Nuovi)</option>
                                <option value="asc">Crescente (A-Z / Vecchi)</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="flex items-center gap-6 border-b border-gray-200 overflow-x-auto custom-scrollbar">
                <button onClick={() => setCurrentFilter('TUTTI')} className={`pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${currentFilter === 'TUTTI' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-black'}`}>Tutti ({localOrders.length})</button>
                {statusTabOrder.map(st => {
                    const count = localOrders.filter(o => o.status === st).length;
                    return (
                        <button key={st} onClick={() => setCurrentFilter(st)} className={`pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${currentFilter === st ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-black'}`}>
                            {statusMap[st as keyof typeof statusMap].label} ({count})
                        </button>
                    )
                })}
            </div>

            {/* Table Card */}
            <div className="bg-white border text-left border-gray-200 rounded-3xl shadow-sm overflow-hidden mt-6">
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500">
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Data e N° Ordine</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider whitespace-nowrap">Data Consegna</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider text-center">Foto</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Defunto</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Utente</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Origine</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Prodotto</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider text-right">Prezzo Pagato</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Destinazione</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider text-center">Ricorrente</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Fiorista</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider min-w-[140px]">Stato</th>
                                <th className="font-semibold py-3 px-2 w-8"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredOrders.length === 0 && (
                                <tr>
                                    <td colSpan={13} className="text-center py-10 text-gray-500">Nessun ordine trovato.</td>
                                </tr>
                            )}
                            {filteredOrders.map(order => {
                                const mainItem = order.items?.[0]?.product;
                                const cancelled = isOrderCancelled(order);
                                return (
                                    <tr
                                        key={order.id}
                                        className={`transition-colors cursor-pointer ${
                                            cancelled
                                                ? 'bg-red-50/70 border-l-4 border-l-red-500'
                                                : selectedOrder?.id === order.id
                                                  ? 'bg-blue-50/50'
                                                  : 'hover:bg-gray-50/80 group'
                                        }`}
                                        onClick={() => handleSelectOrder(order)}
                                    >
                                        <td className="py-3 px-3">
                                            {cancelled ? (
                                                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded inline-block">
                                                    Ordine cancellato
                                                </div>
                                            ) : null}
                                            <div suppressHydrationWarning className="text-gray-500 text-[11px] uppercase tracking-wider mb-0.5 whitespace-nowrap">
                                                {new Date(order.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                                            </div>
                                            <div className="font-bold text-black text-[14px]">{order.orderNumber || `#${order.id.substring(order.id.length - 6).toUpperCase()}`}</div>
                                        </td>
                                        <td className="py-3 px-3 whitespace-nowrap">
                                            <div suppressHydrationWarning className="font-medium text-gray-800 text-[13px]">
                                                {formatDeliveryDate(order)}
                                            </div>
                                        </td>
                                        <td className="py-3 px-3 text-center align-middle">
                                            {order.photos && order.photos.length > 0 ? (
                                                <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-gray-200 shadow-sm mx-auto">
                                                    <Image src={order.photos[0]} alt="Foto Consegna" fill className="object-cover" />
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-3">
                                            {editingOrderId === order.id ? (
                                                <div className="space-y-1.5">
                                                    <input
                                                        value={rowOrderDraft[order.id]?.deceasedName || ''}
                                                        onChange={(e) =>
                                                            setRowOrderDraft((prev) => ({
                                                                ...prev,
                                                                [order.id]: { ...prev[order.id], deceasedName: e.target.value },
                                                            }))
                                                        }
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                                                        placeholder="Defunto"
                                                    />
                                                    <input
                                                        value={rowOrderDraft[order.id]?.cemeteryName || ''}
                                                        onChange={(e) =>
                                                            setRowOrderDraft((prev) => ({
                                                                ...prev,
                                                                [order.id]: { ...prev[order.id], cemeteryName: e.target.value },
                                                            }))
                                                        }
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                                                        placeholder="Cimitero"
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="font-bold text-gray-900 leading-tight break-words">{order.deceasedName || 'Non specificato'}</div>
                                                    <div className="text-gray-500 text-[12px] whitespace-nowrap mt-0.5 flex items-center gap-1"><MapPin size={10} /> {order.cemeteryName || 'Cimitero n.d.'}</div>
                                                </>
                                            )}
                                        </td>
                                        <td className="py-3 px-3">
                                            {editingOrderId === order.id ? (
                                                <div className="space-y-1.5">
                                                    <input
                                                        value={rowOrderDraft[order.id]?.buyerFullName || ''}
                                                        onChange={(e) =>
                                                            setRowOrderDraft((prev) => ({
                                                                ...prev,
                                                                [order.id]: { ...prev[order.id], buyerFullName: e.target.value },
                                                            }))
                                                        }
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                                                        placeholder="Cliente"
                                                    />
                                                    <input
                                                        value={rowOrderDraft[order.id]?.customerPhone || ''}
                                                        onChange={(e) =>
                                                            setRowOrderDraft((prev) => ({
                                                                ...prev,
                                                                [order.id]: { ...prev[order.id], customerPhone: e.target.value },
                                                            }))
                                                        }
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                                                        placeholder="Telefono"
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="font-medium text-black leading-tight break-words">{order.buyerFullName || 'Utente Sconosciuto'}</div>
                                                    <div className="text-gray-500 text-[12px] whitespace-nowrap mt-0.5">{order.customerPhone || 'Nessun Recapito'}</div>
                                                </>
                                            )}
                                        </td>
                                        <td className="py-3 px-3">
                                            <div className="text-gray-700 text-[13px] leading-tight break-words">{order.buyerCity || 'Città n.d.'}</div>
                                            <div className="text-gray-500 text-[12px] leading-tight break-words">{order.buyerCountry || 'Nazione n.d.'}</div>
                                        </td>
                                        <td className="py-3 px-3">
                                            <div className="font-medium text-black leading-tight break-words">{mainItem?.name || 'Composizione Floreale'}</div>
                                            <div className="text-gray-500 text-[12px] mt-0.5 whitespace-nowrap">{order.items?.length > 1 ? `+ ${order.items.length - 1} altri articoli` : '1 Articolo'}</div>
                                        </td>
                                        <td className="py-3 px-3 text-right">
                                            {editingOrderId === order.id ? (
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={rowOrderDraft[order.id]?.totalPriceCents ?? 0}
                                                    onChange={(e) =>
                                                        setRowOrderDraft((prev) => ({
                                                            ...prev,
                                                            [order.id]: {
                                                                ...prev[order.id],
                                                                totalPriceCents: Number(e.target.value || 0),
                                                            },
                                                        }))
                                                    }
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-28 border border-gray-200 rounded px-2 py-1 text-xs text-right"
                                                />
                                            ) : (
                                                <span className="font-semibold text-black bg-gray-50 border border-gray-100 px-2 py-1 rounded-md text-[13px] whitespace-nowrap inline-block">
                                                    {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(order.totalPriceCents / 100)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-3">
                                            {editingOrderId === order.id ? (
                                                <input
                                                    value={rowOrderDraft[order.id]?.cemeteryCity || ''}
                                                    onChange={(e) =>
                                                        setRowOrderDraft((prev) => ({
                                                            ...prev,
                                                            [order.id]: { ...prev[order.id], cemeteryCity: e.target.value },
                                                        }))
                                                    }
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                                                    placeholder="Comune destinazione"
                                                />
                                            ) : (
                                                <>
                                                    <div className="font-medium text-black flex items-start gap-1.5">
                                                        <MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" />
                                                        <span className="leading-tight break-words">{order.cemeteryCity}</span>
                                                    </div>
                                                    <div className="text-gray-500 text-[12px] leading-tight break-words mt-0.5">{order.cemeteryName}</div>
                                                </>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 text-center">
                                            {order.isRecurring ? (
                                                <span className="inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm whitespace-nowrap">
                                                    <Repeat size={11} /> Attivo
                                                </span>
                                            ) : (
                                                <span className="inline-flex px-2 py-1 text-[11px] text-gray-400 font-medium">-</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-3">
                                            {order.partner?.isB2B ? (
                                                <div className="space-y-1">
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider shadow-sm">
                                                        🔌 B2B: {order.partner.shopName}
                                                    </span>
                                                    {order.agencyName && (
                                                        <div className="text-[12px] font-bold text-gray-800 flex items-center gap-1">
                                                            🏛️ {order.agencyName}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className={`text-[13px] inline-block font-semibold break-words leading-tight ${!order.partnerId ? 'text-orange-500 bg-orange-50 px-2 py-1 rounded-md border border-orange-100' : 'text-gray-700'}`}>
                                                    {order.partner?.shopName || order.partner?.ownerName || 'Da Assegnare'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-3">
                                            {editingOrderId === order.id ? (
                                                <select
                                                    value={rowOrderDraft[order.id]?.status || order.status}
                                                    onChange={(e) =>
                                                        setRowOrderDraft((prev) => ({
                                                            ...prev,
                                                            [order.id]: { ...prev[order.id], status: e.target.value },
                                                        }))
                                                    }
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="px-2 py-1.5 pr-6 rounded-full text-[11px] font-semibold tracking-wide appearance-none outline-none cursor-pointer border border-gray-200 bg-white"
                                                >
                                                    {Object.entries(statusMap).map(([key, val]) => (
                                                        <option key={key} value={key} className="bg-white text-black font-sans">{val.label}</option>
                                                    ))}
                                                </select>
                                            ) : canChangeStatus ? (
                                                <select
                                                    value={order.status}
                                                    onChange={(e) => updateStatus(order.id, e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className={`px-2 py-1.5 pr-6 rounded-full text-[11px] font-semibold tracking-wide appearance-none outline-none cursor-pointer border-r-8 border-transparent transition-colors shadow-sm ${statusMap[order.status as keyof typeof statusMap]?.color || 'bg-gray-100 text-gray-800'}`}
                                                >
                                                    {Object.entries(statusMap).map(([key, val]) => (
                                                        <option key={key} value={key} className="bg-white text-black font-sans">{val.label}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <StatusBadge status={order.status} />
                                            )}
                                        </td>
                                        <td className="py-3 px-2 text-center">
                                            <div className="inline-flex items-center gap-1">
                                                {editingOrderId === order.id ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                void saveRowOrderEdit(order);
                                                            }}
                                                            disabled={rowOrderSavingId === order.id}
                                                            className="px-2 py-1 text-[11px] font-semibold rounded bg-black text-white hover:bg-gray-800 disabled:opacity-50"
                                                        >
                                                            Salva
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                cancelRowOrderEdit();
                                                            }}
                                                            className="px-2 py-1 text-[11px] font-semibold rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                        >
                                                            Annulla
                                                        </button>
                                                    </>
                                                ) : cancelled ? (
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-red-600">—</span>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                beginRowOrderEdit(order);
                                                            }}
                                                            className="px-2 py-1 text-[11px] font-semibold rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                        >
                                                            Modifica
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                void deleteRowOrder(order);
                                                            }}
                                                            className="px-2 py-1 text-[11px] font-semibold rounded border border-red-200 text-red-700 hover:bg-red-50"
                                                        >
                                                            Cancella
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div >



            {/* OVERLAY SFONDO DRAWER (Invisibile per click-to-close) */}
            {selectedOrder && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={closeDrawer}
                ></div>
            )}

            {/* ORDER DETAIL DRAWER */}
            <div className={`fixed top-16 right-0 w-[50vw] h-[calc(100vh-4rem)] bg-white shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out border-l border-gray-200 flex flex-col ${selectedOrder ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedOrder && (
                    <>
                        {isOrderCancelled(selectedOrder) ? (
                            <div className="shrink-0 border-b border-red-200 bg-red-600 px-6 py-3 text-center text-sm font-bold uppercase tracking-wider text-white">
                                Ordine cancellato — non visibile al fiorista né alle altre bacheche
                            </div>
                        ) : null}
                        {/* Drawer Header */}
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                            <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Dettaglio Ordine</div>
                                <h3 className="text-xl font-display font-semibold text-gray-900">
                                    {selectedOrder.orderNumber || `Ordine #${selectedOrder.id.substring(selectedOrder.id.length - 6).toUpperCase()}`} - {selectedOrder.buyerFullName || selectedOrder.deceasedName}
                                </h3>
                            </div>
                            <div className="flex items-center gap-3">
                                {isGlobalAdmin && (
                                    <button
                                        type="button"
                                        onClick={() => openDuplicateModal(selectedOrder)}
                                        className="!bg-white !text-gray-800 !font-semibold py-2 px-4 rounded-md shadow-sm hover:!bg-gray-50 transition-all flex items-center gap-2 border border-gray-200"
                                        title="Duplica ordine per nuova consegna"
                                    >
                                        <Copy size={16} /> Duplica
                                    </button>
                                )}
                                <button 
                                    onClick={handleSaveOrder}
                                    disabled={isSaving}
                                    className="!bg-blue-600 !text-white !font-bold py-2 px-6 rounded-md shadow-sm hover:!bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSaving ? 'SALVATAGGIO...' : 'SALVA'}
                                </button>
                                <button onClick={closeDrawer} className="p-2.5 bg-white rounded-full text-gray-400 hover:text-black hover:bg-gray-200 shadow-sm transition-all border border-gray-100">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Drawer Body - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">

                            {/* DETTAGLI CONSEGNA E MEMORIA */}
                            {(() => {
                                let displayInstructions = selectedOrder.additionalInstructions || '';
                                let stripeMetadata: any = null;

                                if (displayInstructions.includes('---B2B_STRIPE_METADATA---')) {
                                    const parts = displayInstructions.split('---B2B_STRIPE_METADATA---');
                                    displayInstructions = parts[0].trim();
                                    try {
                                        stripeMetadata = JSON.parse(parts[1].trim());
                                    } catch (e) {
                                        console.error('Error parsing B2B Stripe metadata:', e);
                                    }
                                }

                                return (
                                    <>
                                        <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100 space-y-3 mb-6">
                                            <h4 className="text-[13px] font-bold text-gray-800 uppercase tracking-widest flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                                                <Users size={14} className="text-fm-gold" /> Dettagli Consegna e Memoria
                                            </h4>
                                            <div className="grid grid-cols-1 gap-3">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Nome Defunto</span>
                                                        <span className="font-bold text-gray-900 text-base">{selectedOrder.deceasedName || 'Non specificato'}</span>
                                                    </div>
                                                    {selectedOrder.agencyName && (
                                                        <div>
                                                            <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Agenzia Funebre (B2B Partner)</span>
                                                            <span className="font-semibold text-emerald-800 text-sm bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded inline-flex items-center gap-1.5 shadow-sm">
                                                                🏛️ {selectedOrder.agencyName}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
                                                    <div>
                                                        <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Luogo / Cimitero</span>
                                                        <span className="font-medium text-gray-800 text-sm">{selectedOrder.cemeteryName || 'Non specificato'}</span>
                                                        {selectedOrder.cemeteryCity && (
                                                            <span className="text-gray-500 text-xs block mt-0.5">
                                                                {selectedOrder.cemeteryCity} {selectedOrder.deliveryProvince ? `(${selectedOrder.deliveryProvince.toUpperCase()})` : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {canChangeStatus ? (
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                                            Indicazioni tomba / posizione consegna
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={selectedOrder.gravePosition || ''}
                                                            onChange={(e) =>
                                                                setSelectedOrder({
                                                                    ...selectedOrder,
                                                                    gravePosition: e.target.value,
                                                                })
                                                            }
                                                            placeholder="Es. Settore 4, fila 12, loculo 3"
                                                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none"
                                                        />
                                                        <p className="text-[10px] text-gray-400 mt-1">
                                                            Obbligatorio per sbloccare il workflow VERA (Punto A).
                                                        </p>
                                                    </div>
                                                ) : selectedOrder.gravePosition ? (
                                                    <span className="text-gray-500 text-xs block">
                                                        Posizione: {selectedOrder.gravePosition}
                                                    </span>
                                                ) : null}
                                                <div className="flex items-start gap-2">
                                                    <Clock size={15} className="text-gray-400 mt-0.5 shrink-0" />
                                                    <div>
                                                        <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Data e Ora Cerimonia</span>
                                                        <span className="font-medium text-gray-800 text-sm">
                                                            {selectedOrder.funeralDate ? new Date(selectedOrder.funeralDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : (selectedOrder.deliveryDate ? new Date(selectedOrder.deliveryDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : 'Data non specificata')}
                                                        </span>
                                                    </div>
                                                </div>
                                                {displayInstructions && (
                                                    <div className="flex items-start gap-2 mt-2 pt-3 border-t border-gray-100">
                                                        <Info size={15} className="text-gray-400 mt-0.5 shrink-0" />
                                                        <div>
                                                            <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Istruzioni Aggiuntive</span>
                                                            <span className="text-gray-700 text-sm leading-snug whitespace-pre-wrap">{displayInstructions}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {selectedOrder.items?.length > 0 ? (() => {
                                            const { mainProducts, accessories } = getOrderProductSummary(selectedOrder.items);
                                            return (
                                                <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3 mb-6">
                                                    <h4 className="text-[13px] font-bold text-gray-800 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-gray-100">
                                                        <Package size={14} className="text-fm-gold" /> Prodotto ordinato
                                                    </h4>
                                                    {mainProducts.length > 0 ? (
                                                        <div>
                                                            <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Composizione principale</span>
                                                            <ul className="space-y-1">
                                                                {mainProducts.map((line, i) => (
                                                                    <li key={`main-${i}`} className="text-sm font-semibold text-gray-900">
                                                                        {line.name}
                                                                        {line.quantity > 1 ? (
                                                                            <span className="ml-1.5 text-xs font-bold text-fm-gold">×{line.quantity}</span>
                                                                        ) : null}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ) : null}
                                                    {accessories.length > 0 ? (
                                                        <div>
                                                            <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Accessori</span>
                                                            <ul className="space-y-1">
                                                                {accessories.map((line, i) => (
                                                                    <li key={`acc-${i}`} className="text-sm text-gray-800 flex items-center justify-between gap-2">
                                                                        <span>{line.name}</span>
                                                                        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                                                                            Qtà {line.quantity}
                                                                        </span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-gray-500">Nessun accessorio aggiuntivo.</p>
                                                    )}
                                                </div>
                                            );
                                        })() : null}

                                        {stripeMetadata && (
                                            <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-100 space-y-3 mb-6">
                                                <h4 className="text-[13px] font-bold text-blue-800 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-blue-100/50">
                                                    💳 Transazione Stripe Connect (Riconciliazione B2B)
                                                </h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                                    {stripeMetadata.stripeCheckoutSessionId && (
                                                        <div>
                                                            <span className="block text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Stripe Checkout Session ID</span>
                                                            <code className="text-gray-700 bg-white px-2 py-1 rounded border border-blue-100 break-all block font-mono font-bold">{stripeMetadata.stripeCheckoutSessionId}</code>
                                                        </div>
                                                    )}
                                                    {stripeMetadata.stripePaymentIntentId && (
                                                        <div>
                                                            <span className="block text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Stripe Payment Intent ID</span>
                                                            <code className="text-gray-700 bg-white px-2 py-1 rounded border border-blue-100 break-all block font-mono font-bold">{stripeMetadata.stripePaymentIntentId}</code>
                                                        </div>
                                                    )}
                                                    {stripeMetadata.stripeConnectedAccountId && (
                                                        <div>
                                                            <span className="block text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Stripe Connected Account ID</span>
                                                            <code className="text-gray-700 bg-white px-2 py-1 rounded border border-blue-100 break-all block font-mono font-bold">{stripeMetadata.stripeConnectedAccountId}</code>
                                                        </div>
                                                    )}
                                                    {stripeMetadata.casperApplicationFeeAmount !== undefined && (
                                                        <div>
                                                            <span className="block text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Casper Application Fee</span>
                                                            <span className="font-bold text-blue-900 text-sm bg-blue-100/50 border border-blue-200 px-2.5 py-0.5 rounded inline-block">
                                                                € {(Number(stripeMetadata.casperApplicationFeeAmount) / 100).toFixed(2)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}

                            {/* FLOW STATO */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                    <Activity size={16} className="text-gray-400" /> Avanzamento
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {Object.keys(statusMap).map(st => (
                                        <button
                                            key={st}
                                            onClick={() => updateStatus(selectedOrder.id, st)}
                                            disabled={!canChangeStatus}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide border transition-all ${selectedOrder.status === st ? statusMap[st as keyof typeof statusMap].color + ' ring-2 ring-offset-1 ring-blue-500/50 border-transparent' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'} ${!canChangeStatus && selectedOrder.status !== st ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {statusMap[st as keyof typeof statusMap].label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* MESSAGGIO BIGLIETTO */}
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                    <MessageSquare size={16} className="text-gray-400" /> Messaggio per il biglietto
                                </h4>
                                {selectedOrder.ticketMessage ? (
                                    <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-xl relative">
                                        <p className="text-orange-800 text-sm italic font-serif leading-relaxed">
                                            "{selectedOrder.ticketMessage}"
                                        </p>
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-500 italic pl-1">Nessun messaggio.</div>
                                )}
                            </div>

                            {/* ASSEGNAZIONE FIORISTA */}
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                    <Users size={16} className="text-gray-400" /> Fiorista Assegnato
                                </h4>
                                {canChangeStatus ? (
                                    <select
                                        className="w-full text-sm text-gray-700 bg-white border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none transition-all shadow-sm font-semibold"
                                        value={selectedOrder.partnerId || ''}
                                        onChange={(e) => setSelectedOrder({ ...selectedOrder, partnerId: e.target.value || null })}
                                    >
                                        <option value="">-- Nessun Fiorista --</option>
                                        {florists.map((f: any) => (
                                            <option key={f.id} value={f.id} className="text-black font-semibold">
                                                {f.shopName} ({f.ownerName})
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-xl flex items-center gap-2">
                                        <span>{selectedOrder.partner?.shopName || selectedOrder.partner?.ownerName || 'Nessun fiorista'}</span>
                                    </div>
                                )}
                                {selectedOrder.partnerId && selectedOrder.floristDeliveryUrl ? (
                                    <ShareableLinkPanel
                                        label="Link mini-app fiorista"
                                        url={selectedOrder.floristDeliveryUrl}
                                        hint="Da inviare al fiorista per caricare le foto prima/dopo la posa."
                                        whatsappPhone={selectedOrder.partner?.whatsappNumber}
                                        whatsappIntro={`Link consegna FloreMoria — ordine ${selectedOrder.orderNumber || selectedOrder.id.slice(-6).toUpperCase()}:`}
                                    />
                                ) : null}
                                {selectedOrder.gdmMagicLinkUrl ? (
                                    <ShareableLinkPanel
                                        label="Magic link cliente (GdM)"
                                        url={selectedOrder.gdmMagicLinkUrl}
                                        hint="Accesso cliente alle foto nel Giardino della Memoria (24h)."
                                        whatsappPhone={selectedOrder.customerPhone}
                                        whatsappIntro={`Il tuo link FloreMoria per vedere le foto in memoria di ${selectedOrder.deceasedName}:`}
                                    />
                                ) : null}
                            </div>

                            {/* DETTAGLI CONSEGNA E NOTE */}
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                    <Info size={16} className="text-gray-400" /> Istruzioni Fiorista / Note Operative
                                </h4>
                                {canChangeStatus ? (
                                    <textarea
                                        className="w-full text-sm text-gray-700 bg-white border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none transition-all shadow-sm min-h-[80px] resize-none"
                                        value={selectedOrder.specialNotes || ''}
                                        onChange={(e) => setSelectedOrder({ ...selectedOrder, specialNotes: e.target.value })}
                                        placeholder="Inserisci note e istruzioni per il fiorista..."
                                    />
                                ) : (
                                    <div className="text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-xl min-h-[48px]">
                                        {selectedOrder.specialNotes || 'Nessuna istruzione aggiuntiva.'}
                                    </div>
                                )}
                            </div>

                            {/* LINEAR TRACKING LOG */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                    <Clock size={16} className="text-gray-400" /> Tracking Log
                                </h4>
                                <div className="flex items-center justify-between w-full mt-4 bg-gray-50 p-6 rounded-2xl border border-gray-100 overflow-x-auto relative">
                                    {/* Linea Singola di BG Orizzontale */}
                                    <div className="absolute top-1/2 left-10 right-10 h-0.5 bg-gray-200 -z-0 -translate-y-1/2"></div>

                                    {/* Step 1 */}
                                    <div className="flex flex-col items-center gap-2 relative z-10 bg-gray-50 px-2 min-w-[80px]">
                                        <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
                                            <Check size={12} strokeWidth={3} />
                                        </div>
                                        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-700">Ricevuto</span>
                                    </div>

                                    {/* Step 2 */}
                                    <div className="flex flex-col items-center gap-2 relative z-10 bg-gray-50 px-2 min-w-[80px]">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${selectedOrder.partnerId ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white border-2 border-gray-300 text-transparent'}`}>
                                            <Check size={12} strokeWidth={3} />
                                        </div>
                                        <span className={`text-[10px] uppercase tracking-wider font-semibold ${selectedOrder.partnerId ? 'text-gray-700' : 'text-gray-400'}`}>Assegnato</span>
                                    </div>

                                    {/* Step 3 */}
                                    <div className="flex flex-col items-center gap-2 relative z-10 bg-gray-50 px-2 min-w-[80px]">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${['IN_PROGRESS', 'DELIVERING', 'COMPLETED'].includes(selectedOrder.status) ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white border-2 border-gray-300 text-transparent'}`}>
                                            <Check size={12} strokeWidth={3} />
                                        </div>
                                        <span className={`text-[10px] uppercase tracking-wider font-semibold ${['IN_PROGRESS', 'DELIVERING', 'COMPLETED'].includes(selectedOrder.status) ? 'text-gray-700' : 'text-gray-400'}`}>In Lavorazione</span>
                                    </div>

                                    {/* Step 4 */}
                                    <div className="flex flex-col items-center gap-2 relative z-10 bg-gray-50 px-2 min-w-[80px]">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${selectedOrder.photos?.length >= 2 ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white border-2 border-gray-300 text-transparent'}`}>
                                            <Check size={12} strokeWidth={3} />
                                        </div>
                                        <span className={`text-[10px] uppercase tracking-wider font-semibold ${selectedOrder.photos?.length >= 2 ? 'text-gray-700' : 'text-gray-400'}`}>Foto OK</span>
                                    </div>

                                    {/* Step 5 */}
                                    <div className="flex flex-col items-center gap-2 relative z-10 bg-gray-50 px-2 min-w-[80px]">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${selectedOrder.status === 'COMPLETED' ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' : 'bg-white border-2 border-gray-300 text-transparent'}`}>
                                            <Check size={12} strokeWidth={3} />
                                        </div>
                                        <span className={`text-[10px] uppercase tracking-wider font-semibold ${selectedOrder.status === 'COMPLETED' ? 'text-green-600' : 'text-gray-400'}`}>Consegnato</span>
                                    </div>
                                </div>
                            </div>

                            {/* FOTO GARANZIA UPLOAD ZONE */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                    <Camera size={16} className="text-gray-400" /> Sincronizzazione Foto Garanzia
                                </h4>
                                <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                                    Carica le foto prima e dopo la posa: trascina un&apos;immagine nel riquadro oppure clicca per selezionarla dal computer.
                                </p>
                                <OrderDetailProofUpload
                                    key={selectedOrder.id}
                                    orderId={selectedOrder.id}
                                    initialBefore={getOrderProofPhotos(selectedOrder).before}
                                    initialAfter={getOrderProofPhotos(selectedOrder).after}
                                    onPhotosUpdated={(before, after) => {
                                        setSelectedOrder((prev: any) =>
                                            prev
                                                ? {
                                                      ...prev,
                                                      photos: [...before, ...after],
                                                      deliveryProof: {
                                                          ...(prev.deliveryProof ?? {}),
                                                          photosBeforeUrls: before,
                                                          photosAfterUrls: after,
                                                          photoBeforeUrl: before[0] ?? null,
                                                          photoAfterUrl: after[0] ?? null,
                                                      },
                                                  }
                                                : prev
                                        );
                                        setLocalOrders((prev) =>
                                            prev.map((o) =>
                                                o.id === selectedOrder.id
                                                    ? {
                                                          ...o,
                                                          photos: [...before, ...after],
                                                          deliveryProof: {
                                                              ...(o.deliveryProof ?? {}),
                                                              photosBeforeUrls: before,
                                                              photosAfterUrls: after,
                                                              photoBeforeUrl: before[0] ?? null,
                                                              photoAfterUrl: after[0] ?? null,
                                                          },
                                                      }
                                                    : o
                                            )
                                        );
                                    }}
                                />
                            </div>

                            {/* CONTATTO RAPIDO */}
                            {selectedOrder.customerPhone && (
                                <div className="pt-4 border-t border-gray-100">
                                    <a
                                        href={`https://wa.me/${selectedOrder.customerPhone.replace(/\D/g, '')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white p-3 rounded-xl shadow-sm transition-colors font-medium text-sm"
                                    >
                                        <Phone size={16} /> Contatta su WhatsApp
                                    </a>
                                </div>
                            )}
                        </div>

                    </>
                )}
            </div>

            <CreateOrderModal
                open={createModalOpen}
                onClose={closeCreateModal}
                duplicateFrom={duplicateSource}
                florists={florists}
                products={products}
                users={users}
                deceasedProfiles={deceasedProfiles}
                onCreated={(order) => {
                    const normalized = {
                        ...order,
                        specialNotes: (order as { additionalInstructions?: string }).additionalInstructions || '',
                    };
                    setLocalOrders((prev) => [normalized, ...prev]);
                    showToast(`Ordine ${(order as { orderNumber?: string }).orderNumber || ''} creato`);
                }}
            />

            {/* Premium Toast Notification */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 bg-black text-white text-xs font-bold uppercase tracking-widest px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border border-gray-800 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    {toast}
                </div>
            )}
        </div >
    );
}
