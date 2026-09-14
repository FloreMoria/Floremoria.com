import { UserRow } from './unifiedUsers';

export type UserAnalyticsMetrics = {
    kpis: {
        totalClients: number;
        payingClients: number;
        registeredClients: number;
        guestClients: number;
        totalOrdersCount: number;
        totalRevenueEur: number;
        aovEur: number;
        ltvEur: number;
        repeatCustomersCount: number;
        retentionRatePercent: number;
    };
    top5Clients: {
        rank: number;
        id: string;
        name: string;
        email: string;
        phone: string;
        totalSpentEur: number;
        ordersCount: number;
        lastOrderDate: string;
        preferredProduct: string;
        preferredProductCount: number;
    }[];
    topProducts: {
        name: string;
        category: string;
        quantity: number;
        revenueEur: number;
        sharePercent: number;
    }[];
    serviceBreakdown: {
        fioriTombe: { label: string; code: string; count: number; revenueEur: number; sharePercent: number };
        perFunerale: { label: string; code: string; count: number; revenueEur: number; sharePercent: number };
        altreRicorrenze: { label: string; code: string; count: number; revenueEur: number; sharePercent: number };
    };
    channelsAndBehavior: {
        direct: { count: number; revenueEur: number; sharePercent: number };
        partner: { count: number; revenueEur: number; sharePercent: number };
        repeatCustomersWithInterval: number;
        avgDaysBetweenFirstAndSecondOrder: number | null;
    };
};

/**
 * Calcola tutte le metriche aggregate di vendita, comportamento d'acquisto e preferenze prodotto
 * partendo dagli utenti unificati e dagli ordini visibili.
 */
export function computeUserSalesAnalytics(users: UserRow[], orders: any[]): UserAnalyticsMetrics {
    // 1. KPI Generali
    const payingUsers = users.filter((u) => (u.ordersCount || u.orders?.length || 0) > 0);
    const totalClients = users.length;
    const payingClients = payingUsers.length;
    const registeredClients = users.filter((u) => u.isRegistered).length;
    const guestClients = users.filter((u) => !u.isRegistered).length;

    const totalRevenueCents = payingUsers.reduce((sum, u) => sum + (u.totalSpentCents || 0), 0);
    const totalOrdersCount = payingUsers.reduce((sum, u) => sum + (u.ordersCount || u.orders?.length || 0), 0);

    const aovCents = totalOrdersCount > 0 ? Math.round(totalRevenueCents / totalOrdersCount) : 0;
    const ltvCents = payingClients > 0 ? Math.round(totalRevenueCents / payingClients) : 0;

    const repeatCustomers = payingUsers.filter((u) => (u.ordersCount || u.orders?.length || 0) >= 2);
    const retentionRatePercent = payingClients > 0 ? Number(((repeatCustomers.length / payingClients) * 100).toFixed(1)) : 0;

    // 2. Top 5 Migliori Clienti
    const sortedBySpending = [...payingUsers].sort((a, b) => (b.totalSpentCents || 0) - (a.totalSpentCents || 0));
    const top5Clients = sortedBySpending.slice(0, 5).map((u, index) => {
        const productMap: Record<string, { name: string; count: number; revenueCents: number }> = {};
        (u.orders || []).forEach((o) => {
            (o.items || []).forEach((it: any) => {
                const prodName = it.product?.name || 'Composizione Floreale';
                if (!productMap[prodName]) {
                    productMap[prodName] = { name: prodName, count: 0, revenueCents: 0 };
                }
                const qty = it.quantity || 1;
                productMap[prodName].count += qty;
                productMap[prodName].revenueCents += (it.priceCents || 0) * qty;
            });
        });

        const sortedProds = Object.values(productMap).sort(
            (a, b) => b.count - a.count || b.revenueCents - a.revenueCents
        );
        const topProd = sortedProds[0];

        return {
            rank: index + 1,
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            totalSpentEur: Number(((u.totalSpentCents || 0) / 100).toFixed(2)),
            ordersCount: u.ordersCount || u.orders?.length || 0,
            lastOrderDate: u.lastOrderDate,
            preferredProduct: topProd?.name || 'Servizio FloreMoria',
            preferredProductCount: topProd?.count || 1,
        };
    });

    // 3. Preferenze Prodotti
    const productStats: Record<string, { name: string; category: string; quantity: number; revenueCents: number }> = {};
    let overallProductRevenueCents = 0;

    orders.forEach((o) => {
        (o.items || []).forEach((it: any) => {
            const prodName = it.product?.name || 'Prodotto FloreMoria';
            const catName = it.product?.category?.name || 'Generale';
            const qty = it.quantity || 1;
            const rev = (it.priceCents || 0) * qty;

            if (!productStats[prodName]) {
                productStats[prodName] = { name: prodName, category: catName, quantity: 0, revenueCents: 0 };
            }
            productStats[prodName].quantity += qty;
            productStats[prodName].revenueCents += rev;
            overallProductRevenueCents += rev;
        });
    });

    const topProducts = Object.values(productStats)
        .sort((a, b) => b.revenueCents - a.revenueCents || b.quantity - a.quantity)
        .slice(0, 6)
        .map((p) => ({
            name: p.name,
            category: p.category,
            quantity: p.quantity,
            revenueEur: Number((p.revenueCents / 100).toFixed(2)),
            sharePercent:
                overallProductRevenueCents > 0
                    ? Number(((p.revenueCents / overallProductRevenueCents) * 100).toFixed(1))
                    : 0,
        }));

    // 4. Ripartizione Tipologia Servizio
    let ftCount = 0;
    let ftRevenueCents = 0;
    let ffCount = 0;
    let ffRevenueCents = 0;
    let otherCount = 0;
    let otherRevenueCents = 0;

    orders.forEach((o) => {
        const num = (o.orderNumber || '').toUpperCase();
        const price = o.totalPriceCents || 0;
        if (num.startsWith('FT-')) {
            ftCount++;
            ftRevenueCents += price;
        } else if (num.startsWith('FF-')) {
            ffCount++;
            ffRevenueCents += price;
        } else {
            otherCount++;
            otherRevenueCents += price;
        }
    });

    const serviceTotalRevenueCents = ftRevenueCents + ffRevenueCents + otherRevenueCents || 1;

    const serviceBreakdown = {
        fioriTombe: {
            label: 'Fiori sulle Tombe',
            code: 'FT',
            count: ftCount,
            revenueEur: Number((ftRevenueCents / 100).toFixed(2)),
            sharePercent: Number(((ftRevenueCents / serviceTotalRevenueCents) * 100).toFixed(1)),
        },
        perFunerale: {
            label: 'Per il Funerale',
            code: 'FF',
            count: ffCount,
            revenueEur: Number((ffRevenueCents / 100).toFixed(2)),
            sharePercent: Number(((ffRevenueCents / serviceTotalRevenueCents) * 100).toFixed(1)),
        },
        altreRicorrenze: {
            label: 'Ricorrenze & Accessori',
            code: 'ALTRO',
            count: otherCount,
            revenueEur: Number((otherRevenueCents / 100).toFixed(2)),
            sharePercent: Number(((otherRevenueCents / serviceTotalRevenueCents) * 100).toFixed(1)),
        },
    };

    // 5. Canali di Vendita & Intervallo Riordino
    let directCount = 0;
    let directRevenueCents = 0;
    let partnerCount = 0;
    let partnerRevenueCents = 0;

    orders.forEach((o) => {
        const isPartner = Boolean(
            o.agencyId ||
                o.referralPartnerId ||
                (o.partnershipChannel && o.partnershipChannel.toUpperCase() !== 'DIRETTA' && o.partnershipChannel.toUpperCase() !== 'DIRETTO')
        );
        const price = o.totalPriceCents || 0;
        if (isPartner) {
            partnerCount++;
            partnerRevenueCents += price;
        } else {
            directCount++;
            directRevenueCents += price;
        }
    });

    const channelsTotalRevenueCents = directRevenueCents + partnerRevenueCents || 1;

    const daysIntervals: number[] = [];
    repeatCustomers.forEach((u) => {
        if (u.orders && u.orders.length >= 2) {
            const sortedDates = u.orders
                .map((o) => new Date(o.createdAt).getTime())
                .sort((a, b) => a - b);
            const diffMs = sortedDates[1] - sortedDates[0];
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            if (diffDays >= 0) {
                daysIntervals.push(diffDays);
            }
        }
    });

    const avgDaysBetweenFirstAndSecondOrder =
        daysIntervals.length > 0
            ? Number((daysIntervals.reduce((a, b) => a + b, 0) / daysIntervals.length).toFixed(1))
            : null;

    const channelsAndBehavior = {
        direct: {
            count: directCount,
            revenueEur: Number((directRevenueCents / 100).toFixed(2)),
            sharePercent: Number(((directRevenueCents / channelsTotalRevenueCents) * 100).toFixed(1)),
        },
        partner: {
            count: partnerCount,
            revenueEur: Number((partnerRevenueCents / 100).toFixed(2)),
            sharePercent: Number(((partnerRevenueCents / channelsTotalRevenueCents) * 100).toFixed(1)),
        },
        repeatCustomersWithInterval: daysIntervals.length,
        avgDaysBetweenFirstAndSecondOrder,
    };

    return {
        kpis: {
            totalClients,
            payingClients,
            registeredClients,
            guestClients,
            totalOrdersCount,
            totalRevenueEur: Number((totalRevenueCents / 100).toFixed(2)),
            aovEur: Number((aovCents / 100).toFixed(2)),
            ltvEur: Number((ltvCents / 100).toFixed(2)),
            repeatCustomersCount: repeatCustomers.length,
            retentionRatePercent,
        },
        top5Clients,
        topProducts,
        serviceBreakdown,
        channelsAndBehavior,
    };
}
