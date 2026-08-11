'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Plus,
    Clock,
    MapPin,
    Flower2,
    X,
    Eye,
    CheckCircle2,
    Truck,
    AlertCircle,
} from 'lucide-react';
import CreateOrderModal from '@/components/dashboard/CreateOrderModal';
import OrderDetailDrawer from '@/components/dashboard/OrderDetailDrawer';

export interface CalendarOrder {
    id: string;
    orderNumber?: string | null;
    status?: string | null;
    deceasedName?: string | null;
    buyerFullName?: string | null;
    cemeteryName?: string | null;
    cemeteryCity?: string | null;
    deliveryDate?: string | Date | null;
    createdAt?: string | Date | null;
    customerPhone?: string | null;
    totalPriceCents?: number | null;
    items?: Array<{
        id?: string;
        quantity?: number;
        priceCents?: number;
        product?: {
            id?: string;
            name?: string;
            slug?: string;
        } | null;
    }> | null;
    partner?: {
        shopName?: string | null;
        ownerName?: string | null;
    } | null;

    // Nuovi campi per Ricorrenze / Date GdM (Giardino della Memoria)
    isGdm?: boolean;
    gdmType?: 'PLANNED' | 'BIRTH' | 'DEATH';
    gdmTitle?: string;
    deceasedProfileId?: string;
}

export interface OrdersCalendarProps {
    orders?: CalendarOrder[];
    florists?: any[];
    products?: any[];
    users?: any[];
    deceasedProfiles?: any[];
    onRefresh?: () => void;
    darkMode?: boolean;
}

const MONTH_NAMES_IT = [
    'Gennaio',
    'Febbraio',
    'Marzo',
    'Aprile',
    'Maggio',
    'Giugno',
    'Luglio',
    'Agosto',
    'Settembre',
    'Ottobre',
    'Novembre',
    'Dicembre',
];

const WEEKDAY_NAMES_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export function getCategoryBadge(
    orderNumber?: string | null,
    isGdm?: boolean,
    gdmType?: string
) {
    if (isGdm || orderNumber?.startsWith('GdM')) {
        const label =
            gdmType === 'BIRTH'
                ? 'GdM Nascita 🎂'
                : gdmType === 'DEATH'
                ? 'GdM Commemorativo 🕊️'
                : 'GdM Pianificato 🌹';
        return {
            prefix: 'GdM',
            label,
            badgeClass:
                'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700 font-bold',
            dotClass: 'bg-amber-500',
        };
    }
    const prefix = (orderNumber || 'FT').substring(0, 2).toUpperCase();
    switch (prefix) {
        case 'FF':
            return {
                prefix: 'FF',
                label: 'Funerale',
                badgeClass:
                    'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
                dotClass: 'bg-rose-500',
            };
        case 'FT':
            return {
                prefix: 'FT',
                label: 'Tomba/Cimitero',
                badgeClass:
                    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800',
                dotClass: 'bg-emerald-500',
            };
        case 'FA':
            return {
                prefix: 'FA',
                label: 'Anniversario/GdM',
                badgeClass:
                    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
                dotClass: 'bg-amber-500',
            };
        case 'FP':
        default:
            return {
                prefix: 'FP',
                label: 'Pet/Altro',
                badgeClass:
                    'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800',
                dotClass: 'bg-purple-500',
            };
    }
}

export function getStatusBadge(
    status?: string | null,
    isGdm?: boolean,
    gdmType?: string
) {
    if (isGdm || status?.startsWith('GDM')) {
        return {
            label:
                gdmType === 'BIRTH'
                    ? 'Nascita GdM 🎂'
                    : gdmType === 'DEATH'
                    ? 'Ricorrenza GdM 🕊️'
                    : 'Data Pianificata GdM 🌹',
            colorClass: 'bg-amber-500 text-white',
            textClass:
                'text-amber-800 bg-amber-50 border-amber-300 dark:text-amber-200 dark:bg-amber-950 dark:border-amber-700 font-semibold',
            icon: Flower2,
        };
    }
    const s = (status || 'PENDING').toUpperCase();
    if (s === 'DELIVERED' || s === 'COMPLETED') {
        return {
            label: 'Consegnato',
            colorClass: 'bg-emerald-500 text-white',
            textClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
            icon: CheckCircle2,
        };
    }
    if (
        s === 'DELIVERING' ||
        s === 'ACCEPTED' ||
        s === 'IN_PROGRESS' ||
        s === 'PROCESSING' ||
        s === 'CONFIRMED'
    ) {
        return {
            label: 'In consegna',
            colorClass: 'bg-blue-500 text-white',
            textClass: 'text-blue-700 bg-blue-50 border-blue-200',
            icon: Truck,
        };
    }
    if (s === 'CANCELLED') {
        return {
            label: 'Annullato',
            colorClass: 'bg-gray-400 text-white',
            textClass: 'text-gray-600 bg-gray-50 border-gray-200',
            icon: AlertCircle,
        };
    }
    return {
        label: 'In attesa',
        colorClass: 'bg-amber-500 text-white',
        textClass: 'text-amber-700 bg-amber-50 border-amber-200',
        icon: Clock,
    };
}

/** Formatta la data in YYYY-MM-DD per la mappa dei giorni. */
function toDateKey(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Converte le anagrafiche GdM (DeceasedProfile) con birthDate, deathDate e plannedDeliveryDates
 * in oggetti CalendarOrder visualizzabili sul calendario come date/ricorrenze GdM.
 */
function buildGdmCalendarItems(
    deceasedProfiles: any[],
    displayYear: number
): CalendarOrder[] {
    const items: CalendarOrder[] = [];

    deceasedProfiles.forEach((profile) => {
        if (!profile || !profile.fullName) return;

        const name = profile.fullName;
        const cemetery = profile.cemeteryName || '';
        const city = profile.cemeteryCity || '';

        // 1. Date Pianificate dall'utente nel GdM (plannedDeliveryDates: string[])
        if (Array.isArray(profile.plannedDeliveryDates)) {
            profile.plannedDeliveryDates.forEach((dStr: string) => {
                if (!dStr || typeof dStr !== 'string') return;
                items.push({
                    id: `gdm-planned-${profile.id}-${dStr}`,
                    orderNumber: 'GdM-Data',
                    status: 'GDM_PLANNED',
                    deceasedName: name,
                    buyerFullName: 'Utente GdM',
                    cemeteryName: cemetery,
                    cemeteryCity: city,
                    deliveryDate: dStr,
                    isGdm: true,
                    gdmType: 'PLANNED',
                    gdmTitle: 'Data Commemorativa Pianificata sul GdM 🌹',
                    deceasedProfileId: profile.id,
                });
            });
        }

        // 2. Anniversario Nascita GdM (birthDate)
        if (profile.birthDate) {
            const bDate = new Date(profile.birthDate);
            if (!isNaN(bDate.getTime())) {
                const month = String(bDate.getMonth() + 1).padStart(2, '0');
                const day = String(bDate.getDate()).padStart(2, '0');
                const birthAnniversaryDate = `${displayYear}-${month}-${day}`;
                items.push({
                    id: `gdm-birth-${profile.id}-${displayYear}`,
                    orderNumber: 'GdM-Nascita',
                    status: 'GDM_ANNIVERSARY',
                    deceasedName: name,
                    buyerFullName: 'Utente GdM',
                    cemeteryName: cemetery,
                    cemeteryCity: city,
                    deliveryDate: birthAnniversaryDate,
                    isGdm: true,
                    gdmType: 'BIRTH',
                    gdmTitle: 'Anniversario di Nascita GdM 🎂',
                    deceasedProfileId: profile.id,
                });
            }
        }

        // 3. Anniversario Morte/Ricorrenza GdM (deathDate)
        if (profile.deathDate) {
            const dDate = new Date(profile.deathDate);
            if (!isNaN(dDate.getTime())) {
                const month = String(dDate.getMonth() + 1).padStart(2, '0');
                const day = String(dDate.getDate()).padStart(2, '0');
                const deathAnniversaryDate = `${displayYear}-${month}-${day}`;
                items.push({
                    id: `gdm-death-${profile.id}-${displayYear}`,
                    orderNumber: 'GdM-Ricorrenza',
                    status: 'GDM_ANNIVERSARY',
                    deceasedName: name,
                    buyerFullName: 'Utente GdM',
                    cemeteryName: cemetery,
                    cemeteryCity: city,
                    deliveryDate: deathAnniversaryDate,
                    isGdm: true,
                    gdmType: 'DEATH',
                    gdmTitle: 'Anniversario Commemorativo GdM 🕊️',
                    deceasedProfileId: profile.id,
                });
            }
        }
    });

    return items;
}

export default function OrdersCalendar({
    orders = [],
    florists = [],
    products = [],
    users = [],
    deceasedProfiles = [],
    onRefresh,
    darkMode = false,
}: OrdersCalendarProps) {
    const today = useMemo(() => new Date(), []);
    const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
    const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0..11
    const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');
    const [liveOrders, setLiveOrders] = useState<CalendarOrder[]>(orders);

    useEffect(() => {
        setLiveOrders(orders);
    }, [orders]);

    const fetchFreshOrders = async () => {
        try {
            const res = await fetch('/api/dashboard/orders', {
                headers: { 'Cache-Control': 'no-cache' },
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.orders)) {
                setLiveOrders(data.orders);
            }
        } catch {
            // Fallback su prop orders
        }
    };

    // Modali e Dettaglio
    const [selectedOrder, setSelectedOrder] = useState<CalendarOrder | null>(null);
    const [drawerOrder, setDrawerOrder] = useState<CalendarOrder | null>(null);
    const [selectedDateForNewOrder, setSelectedDateForNewOrder] = useState<Date | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Navigazione Mese
    const handlePrevMonth = () => {
        if (currentMonth === 0) {
            setCurrentMonth(11);
            setCurrentYear((y) => y - 1);
        } else {
            setCurrentMonth((m) => m - 1);
        }
    };

    const handleNextMonth = () => {
        if (currentMonth === 11) {
            setCurrentMonth(0);
            setCurrentYear((y) => y + 1);
        } else {
            setCurrentMonth((m) => m + 1);
        }
    };

    const handleToday = () => {
        setCurrentYear(today.getFullYear());
        setCurrentMonth(today.getMonth());
    };

    // Genera lista unificata Ordini Reali + Ricorrenze / Date GdM degli Utenti
    const allCalendarItems = useMemo(() => {
        const gdmItems = buildGdmCalendarItems(deceasedProfiles, currentYear);
        return [...liveOrders, ...gdmItems];
    }, [liveOrders, deceasedProfiles, currentYear]);

    // Mappa degli ordini ed eventi GdM indicizzati per YYYY-MM-DD
    const ordersByDateKey = useMemo(() => {
        const map = new Map<string, CalendarOrder[]>();
        allCalendarItems.forEach((item) => {
            const key = toDateKey(item.deliveryDate) || toDateKey(item.createdAt);
            if (!key) return;
            const list = map.get(key) || [];
            list.push(item);
            map.set(key, list);
        });
        return map;
    }, [allCalendarItems]);

    // Genera la griglia dei giorni per il mese corrente (incluso offset Lun-Dom)
    const calendarDays = useMemo(() => {
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

        // In Italia la settimana inizia di Lunedì (0=Lun, 6=Dom)
        let firstDayIndex = firstDayOfMonth.getDay() - 1;
        if (firstDayIndex === -1) firstDayIndex = 6; // Domenica

        const daysInMonth = lastDayOfMonth.getDate();
        const days: Array<{
            date: Date;
            dateKey: string;
            isCurrentMonth: boolean;
            isToday: boolean;
            orders: CalendarOrder[];
        }> = [];

        // Giorni del mese precedente per riempire la prima riga
        const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const prevDate = new Date(currentYear, currentMonth - 1, prevMonthLastDay - i);
            const dateKey = toDateKey(prevDate)!;
            days.push({
                date: prevDate,
                dateKey,
                isCurrentMonth: false,
                isToday: dateKey === toDateKey(today),
                orders: ordersByDateKey.get(dateKey) || [],
            });
        }

        // Giorni del mese corrente
        for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
            const currDate = new Date(currentYear, currentMonth, dayNum);
            const dateKey = toDateKey(currDate)!;
            days.push({
                date: currDate,
                dateKey,
                isCurrentMonth: true,
                isToday: dateKey === toDateKey(today),
                orders: ordersByDateKey.get(dateKey) || [],
            });
        }

        // Giorni del mese successivo per completare la griglia a multipli di 7 (max 42 celle)
        const remainingCells = (7 - (days.length % 7)) % 7;
        for (let i = 1; i <= remainingCells; i++) {
            const nextDate = new Date(currentYear, currentMonth + 1, i);
            const dateKey = toDateKey(nextDate)!;
            days.push({
                date: nextDate,
                dateKey,
                isCurrentMonth: false,
                isToday: dateKey === toDateKey(today),
                orders: ordersByDateKey.get(dateKey) || [],
            });
        }

        return days;
    }, [currentYear, currentMonth, today, ordersByDateKey]);

    // Lista per vista Agenda (ordini ed eventi GdM del mese corrente ordinati per data)
    const agendaOrders = useMemo(() => {
        const list: Array<{ dateKey: string; date: Date; order: CalendarOrder }> = [];
        calendarDays.forEach((day) => {
            if (day.isCurrentMonth && day.orders.length > 0) {
                day.orders.forEach((o) => {
                    list.push({ dateKey: day.dateKey, date: day.date, order: o });
                });
            }
        });
        return list.sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [calendarDays]);

    const openNewOrderModalForDate = (date: Date) => {
        setSelectedDateForNewOrder(date);
        setIsCreateModalOpen(true);
    };

    return (
        <div
            className={`rounded-2xl border shadow-sm transition-colors flex flex-col overflow-hidden ${
                darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
        >
            {/* INTESTAZIONE CALENDARIO */}
            <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/80">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-fm-gold/10 text-fm-gold">
                        <CalendarIcon size={20} />
                    </div>
                    <div>
                        <h3 className="font-display font-bold text-lg leading-tight flex items-center gap-2">
                            <span>{MONTH_NAMES_IT[currentMonth]} {currentYear}</span>
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Ordini di Consegna e Date Commemorative GdM
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Pulsanti Navigazione Mese */}
                    <div className="flex items-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 shadow-sm">
                        <button
                            onClick={handlePrevMonth}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg text-gray-600 dark:text-slate-300 transition-colors"
                            title="Mese precedente"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            onClick={handleToday}
                            className="px-2.5 py-1 text-xs font-bold text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                        >
                            Oggi
                        </button>
                        <button
                            onClick={handleNextMonth}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg text-gray-600 dark:text-slate-300 transition-colors"
                            title="Mese successivo"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    {/* Switcher Mese / Agenda */}
                    <div className="flex items-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 shadow-sm text-xs font-semibold">
                        <button
                            onClick={() => setViewMode('month')}
                            className={`px-3 py-1.5 rounded-lg transition-colors ${
                                viewMode === 'month'
                                    ? 'bg-slate-900 text-white dark:bg-slate-700'
                                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
                            }`}
                        >
                            Vista Mese
                        </button>
                        <button
                            onClick={() => setViewMode('agenda')}
                            className={`px-3 py-1.5 rounded-lg transition-colors ${
                                viewMode === 'agenda'
                                    ? 'bg-slate-900 text-white dark:bg-slate-700'
                                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
                            }`}
                        >
                            Agenda ({agendaOrders.length})
                        </button>
                    </div>

                    {/* Nuova Pianificazione */}
                    <button
                        onClick={() => openNewOrderModalForDate(new Date())}
                        className="px-3.5 py-1.5 rounded-xl bg-fm-gold hover:bg-yellow-600 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                    >
                        <Plus size={14} />
                        <span>Pianifica</span>
                    </button>
                </div>
            </div>

            {/* VISTA MESE */}
            {viewMode === 'month' && (
                <div className="p-3 md:p-4">
                    {/* Intestazione giorni della settimana */}
                    <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2 text-center">
                        {WEEKDAY_NAMES_SHORT.map((w, idx) => (
                            <div
                                key={w}
                                className={`text-[11px] font-bold uppercase tracking-wider py-1 ${
                                    idx >= 5 ? 'text-rose-500' : 'text-slate-400 dark:text-slate-500'
                                }`}
                            >
                                {w}
                            </div>
                        ))}
                    </div>

                    {/* Griglia giorni */}
                    <div className="grid grid-cols-7 gap-1 md:gap-2">
                        {calendarDays.map((day, idx) => {
                            const hasOrders = day.orders.length > 0;
                            return (
                                <div
                                    key={`${day.dateKey}-${idx}`}
                                    onClick={() => {
                                        if (hasOrders) {
                                            setSelectedOrder(day.orders[0]!);
                                        } else {
                                            openNewOrderModalForDate(day.date);
                                        }
                                    }}
                                    className={`min-h-[75px] md:min-h-[100px] p-1.5 md:p-2 rounded-xl border transition-all flex flex-col justify-between cursor-pointer group ${
                                        day.isToday
                                            ? 'border-fm-gold ring-2 ring-fm-gold/30 bg-amber-50/20 dark:bg-amber-950/20'
                                            : day.isCurrentMonth
                                            ? 'bg-white dark:bg-slate-900/60 border-gray-100 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'
                                            : 'bg-gray-50/50 dark:bg-slate-900/20 border-transparent opacity-40'
                                    }`}
                                >
                                    {/* Numero del giorno */}
                                    <div className="flex items-center justify-between w-full">
                                        <span
                                            className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                                                day.isToday
                                                    ? 'bg-fm-gold text-white shadow-sm'
                                                    : day.isCurrentMonth
                                                    ? 'text-gray-800 dark:text-slate-200'
                                                    : 'text-gray-400'
                                            }`}
                                        >
                                            {day.date.getDate()}
                                        </span>

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openNewOrderModalForDate(day.date);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-fm-gold transition-opacity rounded-md hover:bg-gray-100 dark:hover:bg-slate-800"
                                            title="Pianifica ordine per questo giorno"
                                        >
                                            <Plus size={12} />
                                        </button>
                                    </div>

                                    {/* Mini Badge Ordini ed Eventi GdM previsti per il giorno */}
                                    <div className="mt-1 space-y-1 overflow-hidden flex-1">
                                        {day.orders.slice(0, 2).map((ord) => {
                                            const cat = getCategoryBadge(ord.orderNumber, ord.isGdm, ord.gdmType);
                                            const statusInfo = getStatusBadge(ord.status, ord.isGdm, ord.gdmType);

                                            return (
                                                <div
                                                    key={ord.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedOrder(ord);
                                                    }}
                                                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold border flex items-center justify-between gap-1 truncate transition-transform hover:scale-[1.02] ${cat.badgeClass}`}
                                                    title={`${ord.orderNumber || 'GdM'} - ${ord.deceasedName || 'Defunto'}`}
                                                >
                                                    <span className="font-mono font-bold truncate">
                                                        {ord.orderNumber || 'GdM'}
                                                    </span>
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusInfo.colorClass}`} />
                                                </div>
                                            );
                                        })}

                                        {day.orders.length > 2 && (
                                            <div className="text-[9px] font-bold text-slate-500 text-center bg-slate-100 dark:bg-slate-800 rounded py-0.5">
                                                +{day.orders.length - 2} altri
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* VISTA AGENDA */}
            {viewMode === 'agenda' && (
                <div className="p-4 max-h-[420px] overflow-y-auto custom-scrollbar">
                    {agendaOrders.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-sm italic">
                            Nessun ordine o ricorrenza GdM per il mese di {MONTH_NAMES_IT[currentMonth]} {currentYear}.
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {agendaOrders.map(({ date, order }) => {
                                const cat = getCategoryBadge(order.orderNumber, order.isGdm, order.gdmType);
                                const statusInfo = getStatusBadge(order.status, order.isGdm, order.gdmType);
                                const StatusIcon = statusInfo.icon;

                                return (
                                    <div
                                        key={order.id}
                                        onClick={() => setSelectedOrder(order)}
                                        className="p-3.5 rounded-xl border border-gray-100 dark:border-slate-800 hover:border-fm-gold/50 bg-white dark:bg-slate-900/70 transition-all flex items-center justify-between gap-3 cursor-pointer group shadow-sm hover:shadow"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            {/* Data Badge */}
                                            <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
                                                <span className="text-[10px] uppercase font-bold text-slate-400">
                                                    {WEEKDAY_NAMES_SHORT[date.getDay() === 0 ? 6 : date.getDay() - 1]}
                                                </span>
                                                <span className="text-base font-bold text-slate-800 dark:text-slate-100">
                                                    {date.getDate()}
                                                </span>
                                            </div>

                                            {/* Dettagli Ordine / GdM */}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${cat.badgeClass}`}>
                                                        {order.orderNumber || 'GdM'}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border ${statusInfo.textClass}`}>
                                                        <StatusIcon size={10} />
                                                        {statusInfo.label}
                                                    </span>
                                                </div>
                                                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate mt-1 group-hover:text-fm-cta transition-colors">
                                                    🕊️ {order.deceasedName || 'Defunto'}
                                                </h4>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-2 mt-0.5">
                                                    <MapPin size={12} className="shrink-0 text-slate-400" />
                                                    <span>{[order.cemeteryName, order.cemeteryCity].filter(Boolean).join(', ') || 'Cimitero non specificato'}</span>
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedOrder(order);
                                            }}
                                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0"
                                        >
                                            Dettaglio
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* QUICK ORDER / GDM DETAIL MODAL */}
            {selectedOrder && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 fade-in"
                    onClick={() => setSelectedOrder(null)}
                >
                    <div
                        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-gray-100 dark:border-slate-800"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-2.5">
                                <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${getCategoryBadge(selectedOrder.orderNumber, selectedOrder.isGdm, selectedOrder.gdmType).badgeClass}`}>
                                    {selectedOrder.orderNumber || 'GdM'}
                                </span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 border ${getStatusBadge(selectedOrder.status, selectedOrder.isGdm, selectedOrder.gdmType).textClass}`}>
                                    {getStatusBadge(selectedOrder.status, selectedOrder.isGdm, selectedOrder.gdmType).label}
                                </span>
                            </div>
                            <button
                                onClick={() => setSelectedOrder(null)}
                                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-4">
                            <div>
                                <h3 className="text-xl font-display font-bold text-slate-900 dark:text-slate-100">
                                    🕊️ {selectedOrder.deceasedName || 'Defunto non specificato'}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                                    <MapPin size={14} className="text-slate-400" />
                                    <span>{[selectedOrder.cemeteryName, selectedOrder.cemeteryCity].filter(Boolean).join(', ') || 'Luogo consegna non specificato'}</span>
                                </p>
                            </div>

                            {selectedOrder.isGdm && (
                                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200">
                                    <p className="font-bold flex items-center gap-1.5">
                                        <Flower2 size={16} className="text-amber-600 dark:text-amber-400" />
                                        <span>{selectedOrder.gdmTitle || 'Ricorrenza nel Giardino della Memoria (GdM)'}</span>
                                    </p>
                                    <p className="mt-1 text-[11px] opacity-80 leading-relaxed">
                                        Questa data fa parte del Giardino della Memoria inserito dall&apos;utente per il defunto. È possibile pianificare un ordine floreale programmato per questa ricorrenza.
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl text-xs border border-gray-100 dark:border-slate-800">
                                <div>
                                    <span className="text-slate-400 uppercase font-bold block text-[10px]">Data Consegna / Commemorazione</span>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">
                                        {selectedOrder.deliveryDate
                                            ? new Date(selectedOrder.deliveryDate).toLocaleDateString('it-IT', { dateStyle: 'full' })
                                            : 'Non specificata'}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-400 uppercase font-bold block text-[10px]">Utente / Referente</span>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block truncate">
                                        {selectedOrder.buyerFullName || selectedOrder.customerPhone || 'Utente GdM'}
                                    </span>
                                </div>
                            </div>

                            {/* Prodotti Ordinati (se ordine reale) */}
                            {selectedOrder.items && selectedOrder.items.length > 0 && (
                                <div className="space-y-1.5">
                                    <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Prodotti Ordinati</span>
                                    <div className="space-y-1 bg-white dark:bg-slate-900 p-3 rounded-xl border border-gray-100 dark:border-slate-800">
                                        {selectedOrder.items.map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-xs">
                                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                                    {item.quantity || 1}x {item.product?.name || 'Omaggio Floreale'}
                                                </span>
                                                {item.priceCents && (
                                                    <span className="font-mono text-slate-500">
                                                        €{((item.priceCents * (item.quantity || 1)) / 100).toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 flex justify-end gap-2">
                            <button
                                onClick={() => setSelectedOrder(null)}
                                className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors"
                            >
                                Chiudi
                            </button>
                            {selectedOrder.isGdm ? (
                                <button
                                    onClick={() => {
                                        const dDate = selectedOrder.deliveryDate ? new Date(selectedOrder.deliveryDate) : new Date();
                                        openNewOrderModalForDate(dDate);
                                        setSelectedOrder(null);
                                    }}
                                    className="px-4 py-2 bg-fm-gold hover:bg-yellow-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                                >
                                    <Plus size={14} />
                                    <span>Pianifica Ordine per questo GdM</span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        setDrawerOrder(selectedOrder);
                                        setSelectedOrder(null);
                                    }}
                                    className="px-4 py-2 bg-fm-gold hover:bg-yellow-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                                >
                                    <Eye size={14} />
                                    <span>Vedi Dossier Completo</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ORDER DETAIL DRAWER COMPLETO */}
            {drawerOrder && (
                <OrderDetailDrawer
                    order={drawerOrder as any}
                    onClose={() => setDrawerOrder(null)}
                    onOrderUpdated={() => {
                        setDrawerOrder(null);
                        void fetchFreshOrders();
                        onRefresh?.();
                    }}
                    florists={florists}
                    canChangeStatus={true}
                    isGlobalAdmin={true}
                />
            )}

            {/* CREATE ORDER MODAL */}
            {isCreateModalOpen && (
                <CreateOrderModal
                    open={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    onCreated={() => {
                        setIsCreateModalOpen(false);
                        void fetchFreshOrders();
                        onRefresh?.();
                    }}
                    florists={florists}
                    products={products}
                    users={users}
                    deceasedProfiles={deceasedProfiles}
                    duplicateFrom={
                        selectedOrder?.isGdm
                            ? ({
                                  deceasedName: selectedOrder.deceasedName,
                                  cemeteryCity: selectedOrder.cemeteryCity,
                                  cemeteryName: selectedOrder.cemeteryName,
                                  deliveryDate: selectedDateForNewOrder
                                      ? selectedDateForNewOrder.toISOString()
                                      : selectedOrder.deliveryDate,
                                  deceasedProfileId: selectedOrder.deceasedProfileId,
                                  orderCategory: 'FA',
                              } as any)
                            : selectedDateForNewOrder
                            ? ({
                                  deliveryDate: selectedDateForNewOrder.toISOString(),
                              } as any)
                            : null
                    }
                />
            )}
        </div>
    );
}
