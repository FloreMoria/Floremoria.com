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
    Building2,
    ExternalLink,
    Filter,
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
        id?: string;
        shopName?: string | null;
        ownerName?: string | null;
    } | null;

    // Campi per Ricorrenze / Date GdM (Giardino della Memoria)
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

/** Riconosce la tipologia di ordine / GdM */
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

/** Mappatura degli stati per la legenda ed i badge visivi ufficiali */
export function getOrderStatusMeta(
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
                    : 'Pianificato GdM 🌹',
            badgeClass:
                'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700 font-semibold',
            colorClass: 'bg-amber-500 text-white',
            dotClass: 'bg-amber-500',
            icon: Flower2,
        };
    }

    const s = (status || 'PENDING').toUpperCase();

    // 🟢 Consegnato con Foto / Completato (Verde Smeraldo)
    if (s === 'COMPLETED' || s === 'DELIVERED') {
        return {
            label: 'Consegnato con Foto',
            badgeClass:
                'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700 font-semibold',
            colorClass: 'bg-emerald-500 text-white',
            dotClass: 'bg-emerald-500',
            icon: CheckCircle2,
        };
    }

    // 🟣 In Preparazione / In Consegna (Viola/Ciano)
    if (s === 'DELIVERING' || s === 'IN_PROGRESS') {
        return {
            label: 'In Consegna',
            badgeClass:
                'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-700 font-semibold',
            colorClass: 'bg-purple-500 text-white',
            dotClass: 'bg-purple-500',
            icon: Truck,
        };
    }

    // 🔵 Preso in Carico dal Fiorista (Blu/Indaco)
    if (s === 'ACCEPTED' || s === 'CONFIRMED' || s === 'PROCESSING') {
        return {
            label: 'Preso in Carico',
            badgeClass:
                'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:border-indigo-700 font-semibold',
            colorClass: 'bg-indigo-500 text-white',
            dotClass: 'bg-indigo-500',
            icon: Building2,
        };
    }

    // 🔴 Anomalia / In Ritardo / Da Verificare (Rosso/Rosa)
    if (s === 'CANCELLED' || s === 'FAILED' || s === 'DELAYED') {
        return {
            label: s === 'CANCELLED' ? 'Annullato' : 'Anomalia / Verificare',
            badgeClass:
                'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-700 font-semibold',
            colorClass: 'bg-rose-500 text-white',
            dotClass: 'bg-rose-500',
            icon: AlertCircle,
        };
    }

    // 🟡 In Assegnazione / In Attesa Fiorista (Giallo/Ambra)
    return {
        label: 'In Attesa Fiorista',
        badgeClass:
            'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700 font-semibold',
        colorClass: 'bg-amber-500 text-white',
        dotClass: 'bg-amber-500',
        icon: Clock,
    };
}

/** Legacy export per retrocompatibilità */
export function getStatusBadge(
    status?: string | null,
    isGdm?: boolean,
    gdmType?: string
) {
    const meta = getOrderStatusMeta(status, isGdm, gdmType);
    return {
        label: meta.label,
        colorClass: meta.colorClass,
        textClass: meta.badgeClass,
        icon: meta.icon,
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

/** Verifica se due date appartengono al medesimo giorno solare */
function isSameDay(d1: Date, d2: Date): boolean {
    return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
    );
}

/** Calcola l'inizio e la fine della settimana (Lunedì-Domenica) per una data */
function getWeekBounds(date: Date): { start: Date; end: Date; weekNumber: number } {
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Calcolo numero settimana (ISO 8601)
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((dayOfYear + jan1.getDay() + 1) / 7);

    return { start: monday, end: sunday, weekNumber };
}

/**
 * Converte le anagrafiche GdM (DeceasedProfile) in oggetti CalendarOrder.
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

        // 1. Date Pianificate sul GdM
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

        // 2. Anniversario Nascita GdM
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

        // 3. Anniversario Morte/Ricorrenza GdM
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

type ViewModeType = 'day' | 'week' | 'month' | 'year';

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
    const [focusedDate, setFocusedDate] = useState<Date>(today);
    const [viewMode, setViewMode] = useState<ViewModeType>('month');
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

    // Controls per la navigazione temporale avanti/indietro
    const handlePrev = () => {
        setFocusedDate((prev) => {
            const next = new Date(prev);
            if (viewMode === 'day') {
                next.setDate(next.getDate() - 1);
            } else if (viewMode === 'week') {
                next.setDate(next.getDate() - 7);
            } else if (viewMode === 'month') {
                next.setMonth(next.getMonth() - 1);
            } else if (viewMode === 'year') {
                next.setFullYear(next.getFullYear() - 1);
            }
            return next;
        });
    };

    const handleNext = () => {
        setFocusedDate((prev) => {
            const next = new Date(prev);
            if (viewMode === 'day') {
                next.setDate(next.getDate() + 1);
            } else if (viewMode === 'week') {
                next.setDate(next.getDate() + 7);
            } else if (viewMode === 'month') {
                next.setMonth(next.getMonth() + 1);
            } else if (viewMode === 'year') {
                next.setFullYear(next.getFullYear() + 1);
            }
            return next;
        });
    };

    const handleTodayReset = () => {
        setFocusedDate(new Date());
    };

    // Genera lista unificata Ordini + Eventi GdM
    const allCalendarItems = useMemo(() => {
        const gdmItems = buildGdmCalendarItems(deceasedProfiles, focusedDate.getFullYear());
        return [...liveOrders, ...gdmItems];
    }, [liveOrders, deceasedProfiles, focusedDate]);

    // Mappa degli ordini ed eventi GdM per YYYY-MM-DD
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

    // Titolo dinamico del periodo in base alla vista temporale
    const periodTitle = useMemo(() => {
        if (viewMode === 'day') {
            const isTod = isSameDay(focusedDate, today);
            const dateStr = focusedDate.toLocaleDateString('it-IT', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            });
            return isTod ? `Oggi: ${dateStr}` : dateStr;
        }
        if (viewMode === 'week') {
            const { start, end, weekNumber } = getWeekBounds(focusedDate);
            const startStr = `${start.getDate()} ${MONTH_NAMES_IT[start.getMonth()].slice(0, 3)}`;
            const endStr = `${end.getDate()} ${MONTH_NAMES_IT[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
            return `Settimana ${weekNumber} (${startStr} - ${endStr})`;
        }
        if (viewMode === 'month') {
            return `${MONTH_NAMES_IT[focusedDate.getMonth()]} ${focusedDate.getFullYear()}`;
        }
        return `Anno ${focusedDate.getFullYear()}`;
    }, [viewMode, focusedDate, today]);

    // Ordini del giorno per vista OGGI
    const dayOrders = useMemo(() => {
        const key = toDateKey(focusedDate);
        return key ? ordersByDateKey.get(key) || [] : [];
    }, [focusedDate, ordersByDateKey]);

    // Giorni per vista SETTIMANA (Lunedì -> Domenica)
    const weekDays = useMemo(() => {
        const { start } = getWeekBounds(focusedDate);
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const key = toDateKey(d)!;
            days.push({
                date: d,
                dateKey: key,
                isToday: isSameDay(d, today),
                orders: ordersByDateKey.get(key) || [],
            });
        }
        return days;
    }, [focusedDate, today, ordersByDateKey]);

    // Giorni per vista MESE
    const monthCalendarDays = useMemo(() => {
        const year = focusedDate.getFullYear();
        const month = focusedDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);

        let firstDayIndex = firstDayOfMonth.getDay() - 1;
        if (firstDayIndex === -1) firstDayIndex = 6;

        const daysInMonth = lastDayOfMonth.getDate();
        const days: Array<{
            date: Date;
            dateKey: string;
            isCurrentMonth: boolean;
            isToday: boolean;
            orders: CalendarOrder[];
        }> = [];

        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const prevDate = new Date(year, month - 1, prevMonthLastDay - i);
            const dateKey = toDateKey(prevDate)!;
            days.push({
                date: prevDate,
                dateKey,
                isCurrentMonth: false,
                isToday: isSameDay(prevDate, today),
                orders: ordersByDateKey.get(dateKey) || [],
            });
        }

        for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
            const currDate = new Date(year, month, dayNum);
            const dateKey = toDateKey(currDate)!;
            days.push({
                date: currDate,
                dateKey,
                isCurrentMonth: true,
                isToday: isSameDay(currDate, today),
                orders: ordersByDateKey.get(dateKey) || [],
            });
        }

        const remainingCells = (7 - (days.length % 7)) % 7;
        for (let i = 1; i <= remainingCells; i++) {
            const nextDate = new Date(year, month + 1, i);
            const dateKey = toDateKey(nextDate)!;
            days.push({
                date: nextDate,
                dateKey,
                isCurrentMonth: false,
                isToday: isSameDay(nextDate, today),
                orders: ordersByDateKey.get(dateKey) || [],
            });
        }

        return days;
    }, [focusedDate, today, ordersByDateKey]);

    // Mesi per vista ANNO
    const yearMonthsSummary = useMemo(() => {
        const year = focusedDate.getFullYear();
        return MONTH_NAMES_IT.map((mName, mIdx) => {
            const monthStart = new Date(year, mIdx, 1);
            const monthEnd = new Date(year, mIdx + 1, 0);
            let total = 0;
            let completed = 0;
            let active = 0;

            allCalendarItems.forEach((ord) => {
                const d = ord.deliveryDate ? new Date(ord.deliveryDate) : ord.createdAt ? new Date(ord.createdAt) : null;
                if (d && d.getFullYear() === year && d.getMonth() === mIdx) {
                    total += 1;
                    const status = (ord.status || '').toUpperCase();
                    if (status === 'COMPLETED' || status === 'DELIVERED') {
                        completed += 1;
                    } else if (status !== 'CANCELLED') {
                        active += 1;
                    }
                }
            });

            return {
                monthIndex: mIdx,
                monthName: mName,
                total,
                completed,
                active,
                isCurrentMonth: today.getFullYear() === year && today.getMonth() === mIdx,
            };
        });
    }, [focusedDate, allCalendarItems, today]);

    const openNewOrderModalForDate = (date: Date) => {
        setSelectedDateForNewOrder(date);
        setIsCreateModalOpen(true);
    };

    /** Render della card programma per un singolo ordine */
    const renderOrderProgramCard = (ord: CalendarOrder) => {
        const cat = getCategoryBadge(ord.orderNumber, ord.isGdm, ord.gdmType);
        const statusMeta = getOrderStatusMeta(ord.status, ord.isGdm, ord.gdmType);
        const StatusIcon = statusMeta.icon;

        const productList =
            ord.items && ord.items.length > 0
                ? ord.items.map((i) => `${i.quantity || 1}x ${i.product?.name || 'Omaggio'}`).join(', ')
                : 'Omaggio Floreale Programmato';

        const floristName = ord.partner?.shopName || ord.partner?.ownerName || 'Fiorista Territoriale';
        const floristStatus = ord.status === 'ACCEPTED' ? 'Accettato dal Fiorista' : ord.status === 'DELIVERED' || ord.status === 'COMPLETED' ? 'Consegna Effettuata' : 'In Assegnazione';

        return (
            <div
                key={ord.id}
                onClick={() => setSelectedOrder(ord)}
                className="p-4 rounded-xl border border-gray-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-slate-900 shadow-2xs hover:shadow-md transition-all cursor-pointer space-y-3 group"
            >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-bold border ${cat.badgeClass}`}>
                            {ord.orderNumber || 'GdM'}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusMeta.badgeClass}`}>
                            <StatusIcon size={12} /> {statusMeta.label}
                        </span>
                    </div>
                    <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock size={13} className="text-gray-400 shrink-0" />
                        {ord.deliveryDate
                            ? new Date(ord.deliveryDate).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) !== '00:00'
                                ? `Fascia Oraria: ${new Date(ord.deliveryDate).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
                                : 'Giornata Intera'
                            : 'Fascia Oraria da Definire'}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {/* Defunto & Cimitero */}
                    <div>
                        <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px] block mb-0.5">
                            Defunto & Cimitero
                        </span>
                        <p className="font-bold text-gray-900 dark:text-slate-100 text-sm group-hover:text-indigo-600 transition-colors">
                            🕊️ {ord.deceasedName || 'Defunto non specificato'}
                        </p>
                        <p className="text-gray-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin size={12} className="text-gray-400 shrink-0" />
                            {[ord.cemeteryName, ord.cemeteryCity].filter(Boolean).join(', ') || 'Cimitero non specificato'}
                        </p>
                    </div>

                    {/* Prodotto Floreale */}
                    <div>
                        <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px] block mb-0.5">
                            Omaggio Floreale
                        </span>
                        <p className="font-semibold text-gray-800 dark:text-slate-200 truncate" title={productList}>
                            🌸 {productList}
                        </p>
                        <p className="text-gray-400 text-[11px] mt-0.5">
                            Acquirente: {ord.buyerFullName || ord.customerPhone || 'Cliente'}
                        </p>
                    </div>

                    {/* Fiorista Assegnato */}
                    <div>
                        <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px] block mb-0.5">
                            Fiorista Incaricato
                        </span>
                        <p className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-1">
                            <Building2 size={13} className="text-indigo-500 shrink-0" />
                            {floristName}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                            Stato: <span className="font-medium text-gray-700 dark:text-slate-300">{floristStatus}</span>
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div
            className={`rounded-2xl border shadow-sm transition-colors flex flex-col overflow-hidden ${
                darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
        >
            {/* INTESTAZIONE E CONTROLLI VISTA TEMPORALE */}
            <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-700 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/80">
                
                {/* Titolo Periodo con Frecce Navigazione e Reset Oggi */}
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                        <CalendarIcon size={22} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={handlePrev}
                                className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200 transition-colors shadow-2xs"
                                title="Periodo precedente"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <button
                                onClick={handleNext}
                                className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200 transition-colors shadow-2xs"
                                title="Periodo successivo"
                            >
                                <ChevronRight size={18} />
                            </button>
                            
                            <h3 className="font-display font-bold text-lg leading-tight text-gray-900 dark:text-slate-100 capitalize">
                                {periodTitle}
                            </h3>

                            <button
                                onClick={handleTodayReset}
                                className="ml-1 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-lg transition-colors shadow-2xs"
                            >
                                Oggi
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Programma consegne floreali cimiteriali e ricorrenze del Giardino della Memoria
                        </p>
                    </div>
                </div>

                {/* Selettore Vista Temporale (OGGI / Settimana / Mese / Anno) */}
                <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
                    <div className="flex items-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-2xs text-xs font-semibold">
                        <button
                            onClick={() => setViewMode('day')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                viewMode === 'day'
                                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                            }`}
                        >
                            OGGI
                        </button>
                        <button
                            onClick={() => setViewMode('week')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                viewMode === 'week'
                                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                            }`}
                        >
                            Settimana
                        </button>
                        <button
                            onClick={() => setViewMode('month')}
                            className={`px-3 py-1.5 rounded-all ${
                                viewMode === 'month'
                                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                            }`}
                        >
                            Mese
                        </button>
                        <button
                            onClick={() => setViewMode('year')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                viewMode === 'year'
                                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                            }`}
                        >
                            Anno
                        </button>
                    </div>

                    <button
                        onClick={() => openNewOrderModalForDate(focusedDate)}
                        className="px-3.5 py-2 rounded-xl bg-fm-gold hover:bg-yellow-600 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0"
                    >
                        <Plus size={15} />
                        <span>Nuovo Ordine</span>
                    </button>
                </div>
            </div>

            {/* LEGENDA STATI ORDINE UFFICIALE */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 py-2.5 px-4 bg-slate-50/80 dark:bg-slate-900/50 border-b border-gray-100 dark:border-slate-800 text-xs">
                <span className="font-bold text-gray-500 dark:text-slate-400 uppercase text-[10px] tracking-wider shrink-0 flex items-center gap-1">
                    <Filter size={11} /> Legenda Stati:
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> In Attesa Fiorista
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" /> Preso in Carico
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800 text-[11px] font-semibold">
                    <span className="w-2 h-2 rounded-full bg-purple-500" /> In Consegna
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Consegnato con Foto
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> Anomalia / Annullato
                </span>
            </div>

            {/* 1. VISTA OGGI (DAY) */}
            {viewMode === 'day' && (
                <div className="p-4 md:p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                        <h4 className="font-bold text-sm text-gray-900 dark:text-slate-100 flex items-center gap-2">
                            Programma Consegne per {focusedDate.toLocaleDateString('it-IT', { dateStyle: 'full' })}
                        </h4>
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                            {dayOrders.length} {dayOrders.length === 1 ? 'consegna' : 'consegne'}
                        </span>
                    </div>

                    {dayOrders.length === 0 ? (
                        <div className="py-12 text-center rounded-xl bg-gray-50/50 dark:bg-slate-900/30 border border-dashed border-gray-200 dark:border-slate-800">
                            <Clock size={28} className="mx-auto mb-2 text-gray-400" />
                            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                                Nessuna consegna programmata per questa data.
                            </p>
                            <button
                                onClick={() => openNewOrderModalForDate(focusedDate)}
                                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                                <Plus size={14} /> Pianifica ordine per oggi
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dayOrders.map(renderOrderProgramCard)}
                        </div>
                    )}
                </div>
            )}

            {/* 2. VISTA SETTIMANA (WEEK) */}
            {viewMode === 'week' && (
                <div className="p-3 md:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                        {weekDays.map((wDay) => (
                            <div
                                key={wDay.dateKey}
                                className={`rounded-xl border p-3 flex flex-col min-h-[220px] transition-all ${
                                    wDay.isToday
                                        ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/20'
                                        : 'bg-white dark:bg-slate-900/60 border-gray-100 dark:border-slate-800'
                                }`}
                            >
                                <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2 mb-2">
                                    <div className="text-left">
                                        <p className="text-[10px] uppercase font-bold text-gray-400">
                                            {wDay.date.toLocaleDateString('it-IT', { weekday: 'short' })}
                                        </p>
                                        <p className={`text-sm font-extrabold ${wDay.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-slate-100'}`}>
                                            {wDay.date.getDate()} {MONTH_NAMES_IT[wDay.date.getMonth()].slice(0, 3)}
                                        </p>
                                    </div>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300">
                                        {wDay.orders.length}
                                    </span>
                                </div>

                                <div className="space-y-2 flex-1 overflow-y-auto max-h-[300px] custom-scrollbar">
                                    {wDay.orders.length === 0 ? (
                                        <p className="text-[11px] text-gray-400 italic text-center py-4">Libero</p>
                                    ) : (
                                        wDay.orders.map((ord) => {
                                            const cat = getCategoryBadge(ord.orderNumber, ord.isGdm, ord.gdmType);
                                            const statusMeta = getOrderStatusMeta(ord.status, ord.isGdm, ord.gdmType);

                                            return (
                                                <div
                                                    key={ord.id}
                                                    onClick={() => setSelectedOrder(ord)}
                                                    className={`p-2 rounded-lg border text-xs cursor-pointer hover:scale-[1.02] transition-all ${cat.badgeClass}`}
                                                >
                                                    <div className="flex items-center justify-between font-bold text-[11px]">
                                                        <span>{ord.orderNumber || 'GdM'}</span>
                                                        <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`} />
                                                    </div>
                                                    <p className="font-semibold truncate text-gray-900 dark:text-slate-100 mt-1">
                                                        🕊️ {ord.deceasedName || 'Defunto'}
                                                    </p>
                                                    <p className="text-[10px] opacity-80 truncate">
                                                        {ord.cemeteryCity || 'Cimitero'}
                                                    </p>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 3. VISTA MESE (MONTH) */}
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

                    {/* Griglia giorni mese */}
                    <div className="grid grid-cols-7 gap-1 md:gap-2">
                        {monthCalendarDays.map((day, idx) => {
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
                                    className={`min-h-[75px] md:min-h-[105px] p-1.5 md:p-2 rounded-xl border transition-all flex flex-col justify-between cursor-pointer group ${
                                        day.isToday
                                            ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-50/20 dark:bg-indigo-950/20'
                                            : day.isCurrentMonth
                                            ? 'bg-white dark:bg-slate-900/60 border-gray-100 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'
                                            : 'bg-gray-50/50 dark:bg-slate-900/20 border-transparent opacity-40'
                                    }`}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <span
                                            className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                                                day.isToday
                                                    ? 'bg-indigo-600 text-white shadow-xs'
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
                                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-indigo-600 transition-opacity rounded-md hover:bg-gray-100 dark:hover:bg-slate-800"
                                            title="Pianifica ordine"
                                        >
                                            <Plus size={12} />
                                        </button>
                                    </div>

                                    <div className="mt-1 space-y-1 overflow-hidden flex-1">
                                        {day.orders.slice(0, 2).map((ord) => {
                                            const cat = getCategoryBadge(ord.orderNumber, ord.isGdm, ord.gdmType);
                                            const statusMeta = getOrderStatusMeta(ord.status, ord.isGdm, ord.gdmType);

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
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusMeta.dotClass}`} />
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

            {/* 4. VISTA ANNO (YEAR) */}
            {viewMode === 'year' && (
                <div className="p-4 md:p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {yearMonthsSummary.map((m) => (
                            <div
                                key={m.monthIndex}
                                onClick={() => {
                                    const nextDate = new Date(focusedDate.getFullYear(), m.monthIndex, 1);
                                    setFocusedDate(nextDate);
                                    setViewMode('month');
                                }}
                                className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                                    m.isCurrentMonth
                                        ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/20'
                                        : 'bg-white dark:bg-slate-900/60 border-gray-100 dark:border-slate-800 hover:border-gray-300'
                                }`}
                            >
                                <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2 mb-3">
                                    <h4 className="font-bold text-base text-gray-900 dark:text-slate-100">
                                        {m.monthName}
                                    </h4>
                                    <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                        {m.total} ordini
                                    </span>
                                </div>

                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between text-gray-600 dark:text-slate-400">
                                        <span>Consegnati:</span>
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{m.completed}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-600 dark:text-slate-400">
                                        <span>In Lavorazione:</span>
                                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{m.active}</span>
                                    </div>
                                </div>

                                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-3 flex items-center justify-end gap-1">
                                    Apri mese <ChevronRight size={12} />
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* QUICK ORDER / GDM DETAIL MODAL */}
            {selectedOrder && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 fade-in"
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
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 border ${getOrderStatusMeta(selectedOrder.status, selectedOrder.isGdm, selectedOrder.gdmType).badgeClass}`}>
                                    {getOrderStatusMeta(selectedOrder.status, selectedOrder.isGdm, selectedOrder.gdmType).label}
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
                        <div className="p-6 space-y-4 text-left">
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

                            {/* Prodotti Ordinati */}
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
                                    className="px-4 py-2 bg-fm-gold hover:bg-yellow-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
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
                                    className="px-4 py-2 bg-fm-gold hover:bg-yellow-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
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
