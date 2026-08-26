'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Filter, Image as ImageIcon, X, MessageSquare, Phone, MapPin, Package, Camera, Check, Info, Clock, Navigation, Users, Repeat, Activity, Plus, Copy, Calendar as CalendarIcon, Table, Pencil, Trash2 } from 'lucide-react';
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
import {
    buildOrderSearchHaystack,
    normalizeOrderSearchQuery,
} from '@/lib/dashboard/orderSearchHaystack';
import OrderDetailDrawer from '@/components/dashboard/OrderDetailDrawer';
import OrdersCalendar from '@/components/dashboard/OrdersCalendar';
import UserTypeBadge from '@/components/dashboard/UserTypeBadge';
import type { ProfileUserType } from '@prisma/client';

interface ClientOrdersTableProps {
    orders: any[];
    abandonedOrders?: any[];
    florists: any[];
    products: any[];
    users: any[];
    deceasedProfiles: any[];
    canChangeStatus: boolean;
    isGlobalAdmin?: boolean;
}

export default function ClientOrdersTable({ orders, abandonedOrders = [], florists, products, users, deceasedProfiles, canChangeStatus, isGlobalAdmin }: ClientOrdersTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [filterMenuOpen, setFilterMenuOpen] = useState(false);
    const [mainTab, setMainTab] = useState<'OPERATIVE' | 'ABANDONED'>('OPERATIVE');
    const [currentFilter, setCurrentFilter] = useState('TUTTI');
    const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');

    // Filri & Sort State
    const [sortField, setSortField] = useState<'date' | 'deliveryDate' | 'alpha' | 'price'>('deliveryDate');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterDate, setFilterDate] = useState('tutti');

    const [localOrders, setLocalOrders] = useState<any[]>(orders);
    const [localAbandonedOrders, setLocalAbandonedOrders] = useState<any[]>(abandonedOrders);
    React.useEffect(() => { setLocalOrders(orders); }, [orders]);
    React.useEffect(() => { setLocalAbandonedOrders(abandonedOrders); }, [abandonedOrders]);

    // Deep-link da Overview Live Stream: /dashboard/orders?open=<orderId>
    React.useEffect(() => {
        const openId = searchParams.get('open')?.trim();
        if (!openId || localOrders.length === 0) return;
        const order = localOrders.find((o) => o.id === openId);
        if (!order) return;
        setSelectedOrder(order);
        // Pulisce il query param senza ricaricare (stesso drawer della lista Ordini).
        router.replace('/dashboard/orders', { scroll: false });
    }, [searchParams, localOrders, router]);

    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [duplicateSource, setDuplicateSource] = useState<any | null>(null);
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    const [rowOrderSavingId, setRowOrderSavingId] = useState<string | null>(null);
    const [alertsRefreshKey, setAlertsRefreshKey] = useState(0);
    const bumpVeraAlerts = () => setAlertsRefreshKey((k) => k + 1);
    const [rowOrderDraft, setRowOrderDraft] = useState<
        Record<string, { buyerFullName: string; customerPhone: string; deceasedName: string; cemeteryName: string; cemeteryCity: string; totalPriceCents: number; status: string; deliveryDate: string }>
    >({});

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3200);
    };

    const statusMap: Record<string, { label: string; line1: string; line2?: string; color: string }> = {
        'ACCEPTED': {
            label: 'Ricevuto',
            line1: 'Ricevuto',
            color: 'bg-yellow-100 text-yellow-800 border-yellow-200 font-medium',
        },
        'PENDING': {
            label: 'In Attesa',
            line1: 'In',
            line2: 'Attesa',
            color: 'bg-amber-100 text-amber-900 border-amber-300 font-semibold',
        },
        'WAITING': {
            label: 'In Attesa',
            line1: 'In',
            line2: 'Attesa',
            color: 'bg-amber-100 text-amber-900 border-amber-300 font-semibold',
        },
        'IN_PROGRESS': {
            label: 'In Lavorazione',
            line1: 'In',
            line2: 'Lavorazione',
            color: 'bg-blue-100 text-blue-800 border-blue-200 font-medium',
        },
        'DELIVERING': {
            label: 'In Consegna',
            line1: 'In',
            line2: 'Consegna',
            color: 'bg-purple-100 text-purple-800 border-purple-200 font-medium',
        },
        'DELIVERED_UNPAID': {
            label: 'Consegnato (Da Pagare)',
            line1: 'Consegnato',
            line2: 'Da Pagare',
            color: 'bg-orange-100 text-orange-800 border-orange-200 font-semibold',
        },
        'PAID_TO_DELIVER': {
            label: 'Pagato (Da Consegnare)',
            line1: 'Pagato',
            line2: 'Da Consegnare',
            color: 'bg-sky-100 text-sky-800 border-sky-200 font-semibold',
        },
        'PAID': {
            label: 'Pagato (Da Consegnare)',
            line1: 'Pagato',
            line2: 'Da Consegnare',
            color: 'bg-sky-100 text-sky-800 border-sky-200 font-semibold',
        },
        'COMPLETED': {
            label: 'Completato',
            line1: 'Completato',
            color: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-semibold',
        },
        'CANCELLED': {
            label: 'Annullato',
            line1: 'Annullato',
            color: 'bg-red-100 text-red-800 border-red-200 font-medium',
        },
        'GDM_PLANNED': {
            label: 'Ricorrenza GdM',
            line1: 'Ricorrenza',
            line2: 'GdM',
            color: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
        },
        'GDM_ANNIVERSARY': {
            label: 'Ricorrenza GdM',
            line1: 'Ricorrenza',
            line2: 'GdM',
            color: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
        },
    };

    const uniqueStatusOptions = React.useMemo(() => [
        { key: 'ACCEPTED', label: 'Ricevuto' },
        { key: 'PENDING', label: 'In Attesa' },
        { key: 'IN_PROGRESS', label: 'In Lavorazione' },
        { key: 'DELIVERING', label: 'In Consegna' },
        { key: 'DELIVERED_UNPAID', label: 'Consegnato (Da Pagare)' },
        { key: 'PAID_TO_DELIVER', label: 'Pagato (Da Consegnare)' },
        { key: 'COMPLETED', label: 'Completato' },
        { key: 'CANCELLED', label: 'Annullato' },
    ], []);

    const statusTabOrder = [
        'ACCEPTED',
        'PENDING',
        'IN_PROGRESS',
        'DELIVERING',
        'DELIVERED_UNPAID',
        'PAID_TO_DELIVER',
        'COMPLETED',
        'CANCELLED',
    ];

    const formatDeliveryDate = (order: { deliveryDate?: string | Date | null; funeralDate?: string | Date | null }) => {
        const raw = order.deliveryDate || order.funeralDate;
        if (!raw) return '—';
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '—';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
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
        
        let dateVal = '';
        if (order.deliveryDate) {
            const d = new Date(order.deliveryDate);
            if (!isNaN(d.getTime())) {
                dateVal = d.toISOString().split('T')[0];
            }
        }

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
                deliveryDate: dateVal,
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
                    deliveryDate: draft.deliveryDate || null,
                }),
            });
            if (!res.ok) {
                throw new Error('Salvataggio ordine non riuscito.');
            }
            const updated = await res.json();
            const patch = {
                ...draft,
                deliveryDate: updated.deliveryDate,
                ...(draft.status === 'CANCELLED'
                    ? { deletedAt: updated.deletedAt ?? new Date().toISOString() }
                    : {})
            };
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
        const conf = statusMap[status as keyof typeof statusMap] || {
            label: status,
            line1: status.split(' ')[0] || status,
            line2: status.split(' ').slice(1).join(' ') || undefined,
            color: 'bg-gray-100 text-gray-800 border-gray-200',
        };

        return (
            <span
                className={`inline-flex flex-col items-center justify-center w-[92px] min-h-[48px] px-2 py-2 rounded-xl text-[10px] font-bold leading-tight text-center shadow-sm border mx-auto ${conf.color}`}
            >
                <span className="truncate max-w-full">{conf.line1}</span>
                {conf.line2 && <span className="truncate max-w-full">{conf.line2}</span>}
            </span>
        );
    };

    const StatusSelect = ({
        status,
        onChange,
    }: {
        status: string;
        onChange: (newStatus: string) => void;
    }) => {
        const conf = statusMap[status as keyof typeof statusMap] || {
            label: status,
            line1: status.split(' ')[0] || status,
            line2: status.split(' ').slice(1).join(' ') || undefined,
            color: 'bg-gray-100 text-gray-800 border-gray-200',
        };

        return (
            <div className="relative inline-flex items-center justify-center mx-auto">
                <div
                    className={`w-[92px] min-h-[48px] px-2 py-2 rounded-xl text-[10px] font-bold leading-tight text-center flex flex-col items-center justify-center border shadow-sm pointer-events-none ${conf.color}`}
                >
                    <span className="truncate max-w-full">{conf.line1}</span>
                    {conf.line2 && <span className="truncate max-w-full">{conf.line2}</span>}
                </div>
                <select
                    value={status}
                    onChange={(e) => onChange(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs"
                    title="Cambia stato ordine"
                >
                    {uniqueStatusOptions.map((opt) => (
                        <option key={opt.key} value={opt.key} className="bg-white text-black font-sans text-xs py-1">
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>
        );
    };

    const activeBaseList = mainTab === 'OPERATIVE' ? localOrders : localAbandonedOrders;
    let filteredOrders = activeBaseList.filter(o => currentFilter === 'TUTTI' || o.status === currentFilter);

    // Filter Logic
    if (filterDate !== 'tutti') {
        const past = new Date();
        if (filterDate === 'mese') past.setMonth(past.getMonth() - 1);
        if (filterDate === 'trimestre') past.setMonth(past.getMonth() - 3);
        filteredOrders = filteredOrders.filter(o => new Date(o.createdAt) >= past);
    }

    if (filterSearch.trim() !== '') {
        const tokens = normalizeOrderSearchQuery(filterSearch)
            .split(/\s+/)
            .filter(Boolean);
        filteredOrders = filteredOrders.filter((o) => {
            const haystack = buildOrderSearchHaystack(o, statusMap);
            return tokens.every((token) => haystack.includes(token));
        });
    }

    // Sort Logic
    filteredOrders = filteredOrders.sort((a, b) => {
        let cmp = 0;
        if (sortField === 'date') {
            cmp = compareByRecentActivity(a, b);
            if (sortDirection === 'asc') cmp = -cmp;
            return cmp;
        }
        if (sortField === 'deliveryDate') {
            const aRaw = a.deliveryDate || a.funeralDate;
            const bRaw = b.deliveryDate || b.funeralDate;
            const aMs = aRaw ? new Date(aRaw).getTime() : NaN;
            const bMs = bRaw ? new Date(bRaw).getTime() : NaN;
            const aOk = Number.isFinite(aMs);
            const bOk = Number.isFinite(bMs);
            // Senza data consegna: sempre in coda (indipendente da direzione).
            if (!aOk && !bOk) cmp = 0;
            else if (!aOk) cmp = 1;
            else if (!bOk) cmp = -1;
            else cmp = aMs - bMs;
            return sortDirection === 'asc' ? cmp : -cmp;
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
            'Prodotto': o.items?.[0]?.product?.name || 'Composizione',
            'Prezzo': `${(o.totalPriceCents / 100).toFixed(2)} €`,
            'Comune Destinazione': o.cemeteryCity || '',
            'Cimitero': o.cemeteryName || '',
            'Ricorrente': o.isRecurring ? 'Si' : 'No',
            'Fiorista': o.partner?.shopName || o.partner?.ownerName || 'Nessuno',
            'Stato': (statusMap as any)[o.status]?.label || o.status
        }));
        exportToCSV(exportData, mainTab === 'OPERATIVE' ? 'FloreMoria_Ordini_Operativi.csv' : 'FloreMoria_Carrelli_Abbandonati.csv');
    };

    // Salvataggio effettivo nel DB del cambio status
    const updateStatus = async (orderId: string, newStatus: string) => {
        if (!canChangeStatus) return alert("Non hai i permessi per questa azione.");

        const previousOrder = localOrders.find((o) => o.id === orderId);
        const previousStatus = previousOrder?.status;

        // Optimistic Update UI
        setLocalOrders((prev: any[]) => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        setSelectedOrder((prev: any) => prev?.id === orderId ? { ...prev, status: newStatus } : prev);

        try {
            const res = await fetch(`/api/dashboard/orders/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            const data = await res.json().catch(() => null);

            if (res.ok) {
                showToast('Stato ordine aggiornato con successo');
            } else {
                // Rollback in caso di errore
                if (previousStatus) {
                    setLocalOrders((prev: any[]) => prev.map(o => o.id === orderId ? { ...o, status: previousStatus } : o));
                    setSelectedOrder((prev: any) => prev?.id === orderId ? { ...prev, status: previousStatus } : prev);
                }
                alert(data?.error || 'Errore aggiornamento stato nel database.');
            }
        } catch {
            if (previousStatus) {
                setLocalOrders((prev: any[]) => prev.map(o => o.id === orderId ? { ...o, status: previousStatus } : o));
                setSelectedOrder((prev: any) => prev?.id === orderId ? { ...prev, status: previousStatus } : prev);
            }
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
                    deliveryDate: selectedOrder.deliveryDate || null,
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
                    deliveryDate: selectedOrder.deliveryDate,
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
                    {/* Switcher Vista Tabella / Vista Calendario */}
                    <div className="flex items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                                viewMode === 'table'
                                    ? 'bg-black text-white shadow-sm'
                                    : 'text-gray-600 hover:text-black'
                            }`}
                            title="Vista Tabella"
                        >
                            <Table size={14} />
                            <span>Vista Tabella</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('calendar')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                                viewMode === 'calendar'
                                    ? 'bg-black text-white shadow-sm'
                                    : 'text-gray-600 hover:text-black'
                            }`}
                            title="Vista Calendario"
                        >
                            <CalendarIcon size={14} />
                            <span>Vista Calendario</span>
                        </button>
                    </div>
                </div>
            </header>

            {viewMode === 'calendar' ? (
                <div className="mt-6">
                    <OrdersCalendar
                        orders={localOrders}
                        florists={florists}
                        products={products}
                        users={users}
                        deceasedProfiles={deceasedProfiles}
                        onRefresh={() => router.refresh()}
                    />
                </div>
            ) : (
                <>
                    {/* Pannello Filtri Expandibile */}
                    {filterMenuOpen && (
                <div className="bg-gray-50 border border-gray-200 rounded-3xl p-6 mb-6 animate-in fade-in slide-in-from-top-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ricerca Generica</label>
                            <input type="text" placeholder="Defunto, cimitero, comune, fiorista, bouquet, stato, data…" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} className="w-full border-gray-200 rounded-xl text-sm p-2 outline-none focus:ring-2 focus:ring-black" />
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
                                <option value="deliveryDate">Data consegna</option>
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

            {/* Selettore Macro Tab: Ordini Operativi vs Carrelli Abbandonati */}
            {isGlobalAdmin && (
                <div className="flex items-center gap-2 mb-4 bg-gray-100 p-1.5 rounded-2xl w-fit">
                    <button
                        type="button"
                        onClick={() => { setMainTab('OPERATIVE'); setCurrentFilter('TUTTI'); }}
                        className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                            mainTab === 'OPERATIVE'
                                ? 'bg-black text-white shadow-sm'
                                : 'text-gray-600 hover:text-black hover:bg-white/50'
                        }`}
                    >
                        📦 Ordini Operativi ({localOrders.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMainTab('ABANDONED'); setCurrentFilter('TUTTI'); }}
                        className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                            mainTab === 'ABANDONED'
                                ? 'bg-amber-600 text-white shadow-sm'
                                : 'text-gray-600 hover:text-amber-800 hover:bg-white/50'
                        }`}
                    >
                        🛒 Carrelli Abbandonati / Non Pagati ({localAbandonedOrders.length})
                    </button>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="flex items-center gap-6 border-b border-gray-200 overflow-x-auto custom-scrollbar">
                <button onClick={() => setCurrentFilter('TUTTI')} className={`pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${currentFilter === 'TUTTI' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-black'}`}>Tutti ({activeBaseList.length})</button>
                {statusTabOrder.map(st => {
                    const count = activeBaseList.filter(o => o.status === st).length;
                    if (count === 0 && currentFilter !== st) return null;
                    return (
                        <button key={st} onClick={() => setCurrentFilter(st)} className={`pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${currentFilter === st ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-black'}`}>
                            {statusMap[st as keyof typeof statusMap]?.label || st} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Table Card */}
            <div className="bg-white border text-left border-gray-200 rounded-3xl shadow-sm overflow-hidden mt-6">
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500">
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider whitespace-nowrap">Data e N° Ordine</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider whitespace-nowrap">Data Consegna</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider text-center">Foto</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Defunto</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Utente</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Prodotto</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider text-right">Prezzo Pagato</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Destinazione</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider text-center">Ricorrente</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Fiorista</th>
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider min-w-[120px]">Stato</th>
                                <th className="font-semibold py-3 px-3 text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredOrders.length === 0 && (
                                <tr>
                                    <td colSpan={12} className="text-center py-10 text-gray-500">Nessun ordine trovato.</td>
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
                                        <td className="py-3 px-3 whitespace-nowrap">
                                            {cancelled ? (
                                                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded inline-block">
                                                    Ordine cancellato
                                                </div>
                                            ) : null}
                                            <div suppressHydrationWarning className="text-gray-500 text-[11px] uppercase tracking-wider mb-0.5 whitespace-nowrap">
                                                {new Date(order.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                                            </div>
                                            <div className="font-bold text-black text-[14px] whitespace-nowrap">{order.orderNumber || `#${order.id.substring(order.id.length - 6).toUpperCase()}`}</div>
                                        </td>
                                        <td className="py-3 px-3 whitespace-nowrap">
                                            {editingOrderId === order.id ? (
                                                <input
                                                    type="date"
                                                    value={rowOrderDraft[order.id]?.deliveryDate || ''}
                                                    onChange={(e) =>
                                                        setRowOrderDraft((prev) => ({
                                                            ...prev,
                                                            [order.id]: { ...prev[order.id], deliveryDate: e.target.value },
                                                        }))
                                                    }
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                                                />
                                            ) : (
                                                <div suppressHydrationWarning className="font-medium text-gray-800 text-[13px] whitespace-nowrap">
                                                    {formatDeliveryDate(order)}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 text-center align-middle">
                                            {order.photos && order.photos.length > 0 ? (
                                                <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-200 shadow-sm mx-auto">
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
                                                <div className="flex flex-wrap items-center gap-1.5 leading-tight">
                                                    <span className="font-semibold text-black">{order.buyerFullName || 'Utente Sconosciuto'}</span>
                                                    {order.userId ? (
                                                        <span onClick={(e) => e.stopPropagation()}>
                                                            <UserTypeBadge
                                                                userId={order.userId}
                                                                initialType={(order.user?.userType as ProfileUserType) || 'NEW'}
                                                                onChanged={(next) => {
                                                                    setLocalOrders((prev) =>
                                                                        prev.map((o) =>
                                                                            o.id === order.id
                                                                                ? {
                                                                                      ...o,
                                                                                      user: {
                                                                                          ...(o.user || {}),
                                                                                          userType: next,
                                                                                      },
                                                                                  }
                                                                                : o
                                                                        )
                                                                    );
                                                                }}
                                                            />
                                                        </span>
                                                    ) : null}
                                                    {order.customerPhone && (
                                                        <span className="text-gray-500 text-[11px] font-mono whitespace-nowrap">
                                                            · {order.customerPhone}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
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
                                        <td className="py-3 px-3 text-center">
                                            {editingOrderId === order.id ? (
                                                <StatusSelect
                                                    status={rowOrderDraft[order.id]?.status || order.status}
                                                    onChange={(val) =>
                                                        setRowOrderDraft((prev) => ({
                                                            ...prev,
                                                            [order.id]: { ...prev[order.id], status: val },
                                                        }))
                                                    }
                                                />
                                            ) : canChangeStatus ? (
                                                <StatusSelect
                                                    status={order.status}
                                                    onChange={(val) => updateStatus(order.id, val)}
                                                />
                                            ) : (
                                                <StatusBadge status={order.status} />
                                            )}
                                        </td>
                                        <td className="py-3 px-2 text-right">
                                            <div className="flex items-center justify-end gap-1">
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
                                                            X
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
                                                            title="Modifica ordine"
                                                            aria-label="Modifica ordine"
                                                            className="p-1.5 rounded-lg text-gray-600 hover:text-black hover:bg-gray-100 transition-colors"
                                                        >
                                                            <Pencil size={15} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                void deleteRowOrder(order);
                                                            }}
                                                            title="Elimina ordine"
                                                            aria-label="Elimina ordine"
                                                            className="p-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors"
                                                        >
                                                            <Trash2 size={15} />
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
            </div>
                <OrderDetailDrawer
                    order={selectedOrder}
                    onClose={closeDrawer}
                    onOrderUpdated={(updatedOrder) => {
                        setLocalOrders((prev) => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
                        setSelectedOrder(updatedOrder);
                        bumpVeraAlerts();
                    }}
                    florists={florists}
                    canChangeStatus={canChangeStatus}
                    isGlobalAdmin={isGlobalAdmin}
                    openDuplicateModal={openDuplicateModal}
                />
            </>
            )}

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
