'use client';

import React, { useState } from 'react';
import { Download, Filter, MoreHorizontal, Image as ImageIcon, X, MessageSquare, Phone, MapPin, Package, Camera, Check, Info, Clock, Navigation, Users, Repeat, Activity } from 'lucide-react';
import Image from 'next/image';

interface ClientOrdersTableProps {
    orders: any[];
    canChangeStatus: boolean;
    isGlobalAdmin?: boolean;
}

export default function ClientOrdersTable({ orders, canChangeStatus, isGlobalAdmin }: ClientOrdersTableProps) {
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

    const statusMap = {
        'ACCEPTED': { label: 'Ricevuto', color: 'bg-yellow-100 text-yellow-800' },
        'IN_PROGRESS': { label: 'In Lavorazione', color: 'bg-blue-100 text-blue-800' },
        'PENDING': { label: 'In Attesa', color: 'bg-orange-100 text-orange-800' },
        'DELIVERING': { label: 'In Consegna', color: 'bg-purple-100 text-purple-800' },
        'COMPLETED': { label: 'Completato', color: 'bg-green-100 text-green-800' },
        'CANCELLED': { label: 'Annullato', color: 'bg-red-100 text-red-800' }
    };

    const statusTabOrder = ['ACCEPTED', 'IN_PROGRESS', 'PENDING', 'DELIVERING', 'COMPLETED', 'CANCELLED'];

    const handleSelectOrder = (order: any) => {
        setSelectedOrder(order);
    };

    const closeDrawer = () => {
        setSelectedOrder(null);
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
        if (sortField === 'date') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        else if (sortField === 'price') cmp = a.totalPriceCents - b.totalPriceCents;
        else if (sortField === 'alpha') cmp = (a.buyerFullName || '').localeCompare(b.buyerFullName || '');
        return sortDirection === 'asc' ? cmp : -cmp;
    });

    const handleExportCSV = () => {
        const headers = ['Data', 'ID Ordine', 'Acquirente', 'Telefono', 'Origine Citta', 'Origine Nazione', 'Prodotto', 'Prezzo', 'Comune Destinazione', 'Cimitero', 'Ricorrente', 'Fiorista', 'Stato'];
        const csvRows = [headers.join(',')];
        filteredOrders.forEach(o => {
            const dateStr = new Date(o.createdAt).toLocaleDateString('it-IT');
            const idStr = o.id.substring(o.id.length - 6).toUpperCase();
            const mainItem = o.items?.[0]?.product?.name || 'Composizione';
            const price = (o.totalPriceCents / 100).toFixed(2);
            const r = [
                `"${dateStr}"`, `"${idStr}"`, `"${o.buyerFullName || 'Sconosciuto'}"`, `"${o.customerPhone || ''}"`,
                `"${o.buyerCity || ''}"`, `"${o.buyerCountry || ''}"`, `"${mainItem}"`, `"${price} €"`,
                `"${o.cemeteryCity || ''}"`, `"${o.cemeteryName || ''}"`, `"${o.isRecurring ? 'Si' : 'No'}"`,
                `"${o.user?.company || o.user?.name || 'Nessuno'}"`, `"${statusMap[o.status as keyof typeof statusMap]?.label || o.status}"`
            ];
            csvRows.push(r.join(','));
        });
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "FloreMoria_Ordini.csv";
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Gestione mock up cambio status
    const updateStatus = async (orderId: string, newStatus: string) => {
        if (!canChangeStatus) return alert("Non hai i permessi per questa azione.");

        // Optimistic Update UI
        setLocalOrders((prev: any[]) => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        setSelectedOrder((prev: any) => prev?.id === orderId ? { ...prev, status: newStatus } : prev);

        // In produzione verrebbe richiamato un endpoint API
    };

    return (
        <div className="relative">
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
                                <th className="font-semibold py-3 px-3 uppercase text-[11px] tracking-wider">Acquirente</th>
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
                                    <td colSpan={10} className="text-center py-10 text-gray-500">Nessun ordine trovato.</td>
                                </tr>
                            )}
                            {filteredOrders.map(order => {
                                const mainItem = order.items?.[0]?.product;
                                return (
                                    <tr
                                        key={order.id}
                                        className={`transition-colors cursor-pointer ${selectedOrder?.id === order.id ? 'bg-blue-50/50' : 'hover:bg-gray-50/80 group'}`}
                                        onClick={() => handleSelectOrder(order)}
                                    >
                                        <td className="py-3 px-3">
                                            <div suppressHydrationWarning className="text-gray-500 text-[11px] uppercase tracking-wider mb-0.5 whitespace-nowrap">
                                                {new Date(order.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                                            </div>
                                            <div className="font-bold text-black text-[14px]">#{order.id.substring(order.id.length - 6).toUpperCase()}</div>
                                        </td>
                                        <td className="py-3 px-3">
                                            <div className="font-medium text-black leading-tight break-words">{order.buyerFullName || 'Utente Sconosciuto'}</div>
                                            <div className="text-gray-500 text-[12px] whitespace-nowrap mt-0.5">{order.customerPhone || 'Nessun Recapito'}</div>
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
                                            <span className="font-semibold text-black bg-gray-50 border border-gray-100 px-2 py-1 rounded-md text-[13px] whitespace-nowrap inline-block">
                                                {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(order.totalPriceCents / 100)}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3">
                                            <div className="font-medium text-black flex items-start gap-1.5">
                                                <MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" />
                                                <span className="leading-tight break-words">{order.cemeteryCity}</span>
                                            </div>
                                            <div className="text-gray-500 text-[12px] leading-tight break-words mt-0.5">{order.cemeteryName}</div>
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
                                            <span className={`text-[13px] inline-block font-semibold break-words leading-tight ${!order.userId ? 'text-orange-500 bg-orange-50 px-2 py-1 rounded-md border border-orange-100' : 'text-gray-700'}`}>
                                                {order.user?.company || order.user?.name || 'Da Assegnare'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3">
                                            {canChangeStatus ? (
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
                                            <button className="p-1.5 text-gray-400 hover:text-black opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-gray-200">
                                                <MoreHorizontal size={16} />
                                            </button>
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
            <div className={`fixed right-0 top-16 bottom-0 w-[50vw] bg-white shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out border-l border-gray-200 flex flex-col ${selectedOrder ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedOrder && (
                    <>
                        {/* Drawer Header */}
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                            <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Dettaglio Ordine</div>
                                <h3 className="text-xl font-display font-semibold text-gray-900">
                                    Ordine #{selectedOrder.id.substring(selectedOrder.id.length - 6).toUpperCase()} - {selectedOrder.buyerFullName || selectedOrder.deceasedName}
                                </h3>
                            </div>
                            <div className="flex items-center gap-3">
                                <button className="!bg-blue-600 !text-white !font-bold py-2 px-6 rounded-md shadow-sm hover:!bg-blue-700 transition-all flex items-center gap-2">
                                    SALVA
                                </button>
                                <button onClick={closeDrawer} className="p-2.5 bg-white rounded-full text-gray-400 hover:text-black hover:bg-gray-200 shadow-sm transition-all border border-gray-100">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Drawer Body - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">

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
                                        className="w-full text-sm text-gray-700 bg-white border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none transition-all shadow-sm"
                                        defaultValue={selectedOrder.userId || ''}
                                    >
                                        <option value="">-- Nessun Fiorista --</option>
                                        <option value="mock-florist-id">Fioreria Le Rose di Como</option>
                                        <option value="other-florist">Arte Floreale Milano</option>
                                    </select>
                                ) : (
                                    <div className="text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-xl flex items-center gap-2">
                                        <span>{selectedOrder.user?.company || selectedOrder.user?.name || 'Nessun fiorista'}</span>
                                    </div>
                                )}
                            </div>

                            {/* DETTAGLI CONSEGNA E NOTE */}
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                    <MapPin size={16} className="text-gray-400" /> Posizione della consegna
                                </h4>
                                {canChangeStatus ? (
                                    <textarea
                                        className="w-full text-sm text-gray-700 bg-white border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none transition-all shadow-sm min-h-[80px] resize-none"
                                        defaultValue={selectedOrder.specialNotes || ''}
                                        placeholder="Inserisci note sulla posizione..."
                                    />
                                ) : (
                                    <div className="text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-xl min-h-[48px]">
                                        {selectedOrder.specialNotes || 'Nessuna specifica posizione in archivio.'}
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
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${selectedOrder.userId ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white border-2 border-gray-300 text-transparent'}`}>
                                            <Check size={12} strokeWidth={3} />
                                        </div>
                                        <span className={`text-[10px] uppercase tracking-wider font-semibold ${selectedOrder.userId ? 'text-gray-700' : 'text-gray-400'}`}>Assegnato</span>
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

                            {/* FOTO GARANZIA UPLOAD ZONE (DRAG & DROP READY) */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                    <Camera size={16} className="text-gray-400" /> Sincronizzazione Foto Garanzia
                                </h4>
                                <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                                    Le foto vengono automaticamente caricate tramite Bot WhatsApp. Qualora fosse necessario un caricamento manuale, trascina l'immagine col mouse nel riquadro sottostante.
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="border-2 border-dashed border-gray-300 rounded-2xl h-36 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 hover:bg-orange-50/50 hover:text-fm-gold hover:border-fm-gold cursor-pointer transition-all">
                                        <div className="p-2 bg-white rounded-full shadow-sm border border-gray-100 mb-2">
                                            <ImageIcon size={20} className="text-gray-600" />
                                        </div>
                                        <span className="text-[11px] font-semibold text-gray-800">Laboratorio</span>
                                        <span className="text-[10px] font-medium text-gray-400 mt-0.5">Drag & Drop</span>
                                    </div>
                                    <div className="border-2 border-dashed border-gray-300 rounded-2xl h-36 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 hover:bg-orange-50/50 hover:text-fm-gold hover:border-fm-gold cursor-pointer transition-all">
                                        <div className="p-2 bg-white rounded-full shadow-sm border border-gray-100 mb-2">
                                            <MapPin size={20} className="text-gray-600" />
                                        </div>
                                        <span className="text-[11px] font-semibold text-gray-800">Cimitero</span>
                                        <span className="text-[10px] font-medium text-gray-400 mt-0.5">Drag & Drop</span>
                                    </div>
                                </div>
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

        </div >
    );
}
